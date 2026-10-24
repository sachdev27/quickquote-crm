import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authed } from "./auth.server";
import { getEnv } from "./env.server";
import { EXTRACT_SYSTEM, getProvider } from "./ai.server";
import { MAX_FILE_BYTES, extractionSchema, type InboundMessage } from "@/lib/ai/inbound";
import {
  MAX_TEXT_CHARS,
  classify,
  docxToText,
  fromBase64,
  htmlToText,
  xlsxToText,
} from "@/lib/ai/files";

const message = z.object({
  source: z.enum(["upload", "email"]).default("upload"),
  subject: z.string().max(500).optional(),
  from: z.string().max(500).optional(),
  text: z.string().max(30_000).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string().max(200),
        mime: z.string().max(200),
        // base64 is ~4/3 of the raw size
        base64: z.string().max(Math.ceil((MAX_FILE_BYTES * 4) / 3) + 16),
      }),
    )
    .max(3),
});

// Turn a raw enquiry (text and/or files) into structured items. It does not price anything or touch
// the database; matching to the catalog and pricing happen afterwards from the real product list.
export const extractEnquiry = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(message)
  .handler(async ({ data }) => {
    if (!data.text?.trim() && !data.attachments.length) throw new Error("Add some text or a file");
    const provider = getProvider(await getEnv());
    const msg = await prepare(data);
    const raw = await provider.extractJson({ system: EXTRACT_SYSTEM, message: msg });
    let json: unknown;
    try {
      json = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      throw new Error("The AI reply was not valid JSON, try again");
    }
    return { provider: provider.name, extraction: extractionSchema.parse(json) };
  });

// PDFs, photos and voice notes go to the model as they are; Word, Excel and text-like files are read
// to text here and appended to the message, so the provider only ever sees text plus inline media.
async function prepare(data: z.infer<typeof message>): Promise<InboundMessage> {
  const attachments: InboundMessage["attachments"] = [];
  const extra: string[] = [];
  for (const a of data.attachments) {
    const c = classify(a.name, a.mime);
    if (!c) throw new Error(`${a.name}: unsupported file type`);
    if (c.kind === "inline") {
      attachments.push({ name: a.name, mime: c.mime, base64: a.base64 });
      continue;
    }
    const bytes = fromBase64(a.base64);
    let body: string;
    try {
      body =
        c.kind === "docx"
          ? docxToText(bytes)
          : c.kind === "xlsx"
            ? xlsxToText(bytes)
            : /\.html?$/i.test(a.name) || c.mime === "text/html"
              ? htmlToText(new TextDecoder().decode(bytes))
              : new TextDecoder().decode(bytes);
    } catch (e) {
      throw new Error(`${a.name}: ${e instanceof Error ? e.message : "could not be read"}`);
    }
    extra.push(`--- Attachment: ${a.name} ---\n${body}`);
  }
  const text = [data.text, ...extra].filter(Boolean).join("\n\n").slice(0, MAX_TEXT_CHARS);
  return { ...data, text, attachments };
}
