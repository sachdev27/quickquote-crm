import { eq } from "drizzle-orm";
import { getDb, type Env } from "./env.server";
import { settings } from "./schema";

// Read-only access to one shared mailbox (default sales@tarko.in) through Google OAuth. The refresh
// token is stored AES-GCM encrypted in the settings table, keyed from the OAuth client secret, and is
// never returned to the browser.
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const KEY_TOKEN = "gmail_refresh";
const KEY_EMAIL = "gmail_email";

export const gmailAccount = (env: Env) => (env.GMAIL_ACCOUNT || "sales@tarko.in").toLowerCase();
export const gmailLabel = (env: Env) => (env.GMAIL_LABEL || "Quotes").replace(/[^\w -]/g, "");
export const gmailConfigured = (env: Env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function aesKey(env: Env) {
  const raw = new TextEncoder().encode(`gmail:${env.GOOGLE_CLIENT_SECRET ?? ""}`);
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", raw),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
async function seal(env: Env, plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await aesKey(env),
      new TextEncoder().encode(plain),
    ),
  );
  return b64(new Uint8Array([...iv, ...ct]));
}
async function unseal(env: Env, sealed: string) {
  const all = unb64(sealed);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: all.slice(0, 12) },
    await aesKey(env),
    all.slice(12),
  );
  return new TextDecoder().decode(plain);
}

async function put(key: string, value: string) {
  await (
    await getDb()
  )
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}
async function get(key: string) {
  const [r] = await (await getDb()).select().from(settings).where(eq(settings.key, key));
  return r?.value ?? null;
}

export async function connectedEmail() {
  return get(KEY_EMAIL);
}

export async function storeConnection(env: Env, refreshToken: string, email: string) {
  await put(KEY_TOKEN, await seal(env, refreshToken));
  await put(KEY_EMAIL, email);
  cached = null;
}

export async function dropConnection(env: Env) {
  const sealed = await get(KEY_TOKEN);
  if (sealed) {
    try {
      const token = await unseal(env, sealed);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST",
      });
    } catch {
      /* already revoked or unreadable: just forget it */
    }
  }
  const db = await getDb();
  await db.delete(settings).where(eq(settings.key, KEY_TOKEN));
  await db.delete(settings).where(eq(settings.key, KEY_EMAIL));
  cached = null;
}

export async function exchangeCode(env: Env, code: string, redirectUri: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const j = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    error_description?: string;
  };
  if (!res.ok || !j.access_token)
    throw new Error(`Google sign-in failed: ${j.error_description ?? res.status}`);
  return { accessToken: j.access_token, refreshToken: j.refresh_token ?? null };
}

let cached: { token: string; until: number } | null = null;
async function accessToken(env: Env) {
  if (cached && cached.until > Date.now() + 30_000) return cached.token;
  const sealed = await get(KEY_TOKEN);
  if (!sealed)
    throw new Error("Gmail is not connected. An admin can connect it on the AI Quote page.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      refresh_token: await unseal(env, sealed),
      client_id: env.GOOGLE_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !j.access_token) {
    if (j.error === "invalid_grant")
      throw new Error("The Gmail connection expired. An admin must reconnect it.");
    throw new Error(`Gmail token error: ${j.error ?? res.status}`);
  }
  cached = { token: j.access_token, until: Date.now() + (j.expires_in ?? 3000) * 1000 };
  return cached.token;
}

export async function gmailGet<T>(
  env: Env,
  path: string,
  params: Record<string, string | string[]> = {},
) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`);
  for (const [k, v] of Object.entries(params))
    for (const x of Array.isArray(v) ? v : [v]) url.searchParams.append(k, x);
  const res = await fetch(url, { headers: { authorization: `Bearer ${await accessToken(env)}` } });
  if (!res.ok) throw new Error(`Gmail error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export async function profileEmail(accessTok: string) {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { authorization: `Bearer ${accessTok}` },
  });
  if (!res.ok) throw new Error("Could not read the Gmail profile");
  return ((await res.json()) as { emailAddress: string }).emailAddress.toLowerCase();
}
