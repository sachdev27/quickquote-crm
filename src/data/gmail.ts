import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminOnly, authed } from "./auth.server";
import { getEnv } from "./env.server";
import { runExtraction } from "./ai.server";
import {
  GMAIL_SCOPE,
  connectedEmail,
  dropConnection,
  exchangeCode,
  gmailAccount,
  gmailConfigured,
  gmailGet,
  gmailLabel,
  profileEmail,
  storeConnection,
} from "./gmail.server";
import { MAX_FILE_BYTES, type InboundMessage } from "@/lib/ai/inbound";
import { classify, htmlToText } from "@/lib/ai/files";

const redirect = z
  .string()
  .url()
  .max(300)
  .refine((u) => new URL(u).pathname === "/gmail-callback", "Bad redirect");

export const gmailStatus = createServerFn({ method: "GET" })
  .middleware([authed])
  .handler(async ({ context }) => {
    const env = await getEnv();
    return {
      configured: gmailConfigured(env),
      email: await connectedEmail(),
      account: gmailAccount(env),
      label: gmailLabel(env),
      isAdmin: context.role === "admin",
    };
  });

export const gmailAuthUrl = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .validator(z.object({ redirectUri: redirect, state: z.string().min(8).max(100) }))
  .handler(async ({ data }) => {
    const env = await getEnv();
    if (!gmailConfigured(env))
      throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set");
    const q = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: data.redirectUri,
      response_type: "code",
      scope: GMAIL_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state: data.state,
      login_hint: gmailAccount(env),
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` };
  });

export const gmailConnect = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .validator(z.object({ code: z.string().min(4).max(500), redirectUri: redirect }))
  .handler(async ({ data }) => {
    const env = await getEnv();
    const t = await exchangeCode(env, data.code, data.redirectUri);
    const email = await profileEmail(t.accessToken);
    if (email !== gmailAccount(env))
      throw new Error(`Signed in as ${email}, but only ${gmailAccount(env)} can be connected`);
    if (!t.refreshToken)
      throw new Error(
        "Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and connect again",
      );
    await storeConnection(env, t.refreshToken, email);
    return { email };
  });

export const gmailDisconnect = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .handler(async () => {
    await dropConnection(await getEnv());
    return { ok: true };
  });

// Non-admins only ever see the shared label; "whole inbox" is an admin option. Search words are
// stripped of Gmail operators so they cannot widen the query beyond that label.
const plain = (s: string) =>
  s
    .replace(/[^\p{L}\p{N}@.\- ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

interface Hdr {
  name: string;
  value: string;
}
const header = (h: Hdr[] | undefined, n: string) =>
  h?.find((x) => x.name.toLowerCase() === n)?.value ?? "";

export const gmailList = createServerFn({ method: "GET" })
  .middleware([authed])
  .validator(z.object({ q: z.string().max(100).default(""), all: z.boolean().default(false) }))
  .handler(async ({ data, context }) => {
    const env = await getEnv();
    const scope =
      data.all && context.role === "admin"
        ? "in:inbox"
        : `label:${gmailLabel(env).replace(/ /g, "-")}`;
    const list = await gmailGet<{ messages?: { id: string }[] }>(env, "messages", {
      q: `${scope} ${plain(data.q)}`.trim(),
      maxResults: "20",
    });
    const rows = await Promise.all(
      (list.messages ?? []).map((m) =>
        gmailGet<{
          id: string;
          snippet: string;
          internalDate: string;
          payload?: { headers?: Hdr[] };
        }>(env, `messages/${m.id}`, {
          format: "metadata",
          metadataHeaders: ["From", "Subject"],
        }),
      ),
    );
    return rows.map((r) => ({
      id: r.id,
      from: header(r.payload?.headers, "from"),
      subject: header(r.payload?.headers, "subject") || "(no subject)",
      date: Number(r.internalDate),
      snippet: r.snippet,
    }));
  });

interface Part {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: Part[];
}
const flat = (p: Part): Part[] => [p, ...(p.parts ?? []).flatMap(flat)];
const stdB64 = (u: string) => {
  const s = u.replace(/-/g, "+").replace(/_/g, "/");
  return s + "=".repeat((4 - (s.length % 4)) % 4);
};
const utf8 = (u: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(stdB64(u)), (c) => c.charCodeAt(0)));

// Read one email (body plus up to 3 usable attachments) and run it through the AI pipeline.
export const gmailExtract = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ id: z.string().regex(/^[\w-]{6,40}$/) }))
  .handler(async ({ data, context }) => {
    const env = await getEnv();
    const msg = await gmailGet<{
      labelIds?: string[];
      payload: Part & { headers?: Hdr[] };
    }>(env, `messages/${data.id}`, { format: "full" });

    if (context.role !== "admin") {
      const labels = await gmailGet<{ labels: { id: string; name: string }[] }>(env, "labels");
      const want = labels.labels.find(
        (l) => l.name.toLowerCase() === gmailLabel(env).toLowerCase(),
      );
      if (!want || !msg.labelIds?.includes(want.id))
        throw new Error("That email is not in the shared label");
    }

    const parts = flat(msg.payload);
    const plainPart = parts.find((p) => p.mimeType === "text/plain" && p.body?.data && !p.filename);
    const htmlPart = parts.find((p) => p.mimeType === "text/html" && p.body?.data && !p.filename);
    const text = plainPart?.body?.data
      ? utf8(plainPart.body.data)
      : htmlPart?.body?.data
        ? htmlToText(utf8(htmlPart.body.data))
        : "";

    const attachments: InboundMessage["attachments"] = [];
    for (const p of parts) {
      if (attachments.length >= 3) break;
      if (!p.filename || !p.body?.attachmentId) continue;
      const c = classify(p.filename, p.mimeType ?? "");
      const size = p.body.size ?? 0;
      if (!c || size > MAX_FILE_BYTES) continue;
      if (c.mime.startsWith("image/") && size < 15_000) continue; // signature logos
      const a = await gmailGet<{ data: string }>(
        env,
        `messages/${data.id}/attachments/${p.body.attachmentId}`,
      );
      attachments.push({ name: p.filename, mime: c.mime, base64: stdB64(a.data) });
    }

    const subject = header(msg.payload.headers, "subject");
    const from = header(msg.payload.headers, "from");
    const result = await runExtraction(env, { source: "email", subject, from, text, attachments });
    return { ...result, subject, from, files: attachments.map((a) => a.name) };
  });
