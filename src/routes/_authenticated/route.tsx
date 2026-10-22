import { createFileRoute, Outlet } from "@tanstack/react-router";

// Login is handled at the edge by Cloudflare Access; server functions re-verify the Access JWT.
export const Route = createFileRoute("/_authenticated")({
  component: () => <Outlet />,
});
