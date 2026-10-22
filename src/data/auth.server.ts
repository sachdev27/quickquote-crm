import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getEnv } from "./env.server";

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

// Login is Cloudflare Access (email one-time PIN etc.). It signs a JWT for every request that
// passes the Access policy; we verify it here so server functions also fail closed if Access is bypassed.
async function currentUser(): Promise<string> {
  if (import.meta.env.DEV) return "dev@local";
  const { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud } = await getEnv();
  if (!team || !aud) throw new Error("Cloudflare Access is not configured (ACCESS_TEAM_DOMAIN / ACCESS_AUD)");
  const token = getRequest().headers.get("cf-access-jwt-assertion");
  if (!token) throw new Response("Unauthorized", { status: 401 });
  jwks ??= createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
  const { payload } = await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: aud });
  return String(payload["email"] ?? payload.sub);
}

export const authed = createMiddleware({ type: "function" }).server(async ({ next }) => {
  return next({ context: { user: await currentUser() } });
});
