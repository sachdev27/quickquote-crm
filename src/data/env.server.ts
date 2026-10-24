import type { D1Database } from "@cloudflare/workers-types";
import { createServerOnlyFn } from "@tanstack/react-start";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export interface Env {
  DB: D1Database;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  // AI quotes: secret in production (`wrangler secret put GEMINI_API_KEY`), .dev.vars locally
  GEMINI_API_KEY?: string;
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  // Gmail inbox for AI quotes (secrets): OAuth client from Google Cloud, internal Workspace app
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GMAIL_ACCOUNT?: string; // the only mailbox that may be connected (default sales@tarko.in)
  GMAIL_LABEL?: string; // label shown to non-admins (default Quotes)
}

let envP: Promise<Env> | undefined;

// Workers: bindings come from `cloudflare:workers`. Local dev (plain Vite/Node): wrangler's emulated
// bindings, backed by .wrangler/state (`npm run local` applies migrations first).
// createServerOnlyFn strips this body from the client bundle; otherwise Vite tries to pre-bundle all of
// wrangler for the browser in dev (multi-GB, hangs the page).
export const getEnv = createServerOnlyFn((): Promise<Env> => {
  envP ??= import.meta.env.DEV
    ? import("wrangler").then((m) => m.getPlatformProxy<Env>()).then((p) => p.env)
    : (async () => {
        const spec = "cloudflare:workers"; // variable specifier: bundler leaves it for the runtime
        return ((await import(/* @vite-ignore */ spec)) as { env: Env }).env;
      })();
  return envP;
});

export async function getDb() {
  return drizzle((await getEnv()).DB, { schema });
}
