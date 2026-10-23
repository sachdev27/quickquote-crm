import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getDb, getEnv } from "./env.server";
import { users } from "./schema";

export type Role = "admin" | "accountant";

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

// Login is Cloudflare Access (Google / one-time PIN). It signs a JWT for every request that passes the
// Access policy; we verify it here so server functions also fail closed if Access is bypassed.
async function verifiedEmail(): Promise<string> {
  if (import.meta.env.DEV) return "dev@local";
  const { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud } = await getEnv();
  if (!team || !aud)
    throw new Error("Cloudflare Access is not configured (ACCESS_TEAM_DOMAIN / ACCESS_AUD)");
  const token = getRequest().headers.get("cf-access-jwt-assertion");
  if (!token) throw new Response("Unauthorized", { status: 401 });
  jwks ??= createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
  const { payload } = await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: aud });
  return String(payload["email"] ?? payload.sub).toLowerCase();
}

// Identity → role from the users table. Unknown emails are refused even if Access let them in.
async function currentUser(): Promise<{ user: string; role: Role }> {
  const email = await verifiedEmail();
  if (import.meta.env.DEV) return { user: email, role: "admin" };
  const [u] = await (await getDb()).select().from(users).where(eq(users.email, email));
  if (!u)
    throw new Error(
      `${email} is not a user of this CRM. Ask an admin to add you under Settings → Users.`,
    );
  return { user: email, role: u.role as Role };
}

export const authed = createMiddleware({ type: "function" }).server(async ({ next }) => {
  return next({ context: await currentUser() });
});

// Pricing, products, brands, terms and users: admins only.
export const adminOnly = createMiddleware({ type: "function" })
  .middleware([authed])
  .server(async ({ next, context }) => {
    if (context.role !== "admin") throw new Error("Only an admin can change this.");
    return next();
  });
