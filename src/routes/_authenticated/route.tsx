import { createFileRoute, Outlet } from "@tanstack/react-router";
import { listCategories } from "@/data/api";
import { registerCategories } from "@/lib/quote";

// Login is handled at the edge by Cloudflare Access; server functions re-verify the Access JWT.
export const Route = createFileRoute("/_authenticated")({
  loader: () => listCategories(),
  component: Shell,
});

function Shell() {
  registerCategories(Route.useLoaderData().categories); // runs on server and client render before children read labels
  return <Outlet />;
}
