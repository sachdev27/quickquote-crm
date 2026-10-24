import { createFileRoute, redirect } from "@tanstack/react-router";

// No landing page: the app opens straight on Quotes (Cloudflare Access already handles login).
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
