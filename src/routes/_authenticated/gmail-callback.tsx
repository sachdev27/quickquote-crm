import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageShell } from "@/components/bottom-nav";
import { gmailConnect } from "@/data/gmail";

const GMAIL_STATE_KEY = "qq-gmail-state";

// Google sends the admin back here with ?code=...; the code is traded for the mailbox token on the server.
export const Route = createFileRoute("/_authenticated/gmail-callback")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { code?: string; state?: string; error?: string } => ({
    ...(typeof s["code"] === "string" ? { code: s["code"] } : {}),
    ...(typeof s["state"] === "string" ? { state: s["state"] } : {}),
    ...(typeof s["error"] === "string" ? { error: s["error"] } : {}),
  }),
  head: () => ({ meta: [{ title: "Connecting Gmail — Tarko CRM" }] }),
  component: GmailCallback,
});

function GmailCallback() {
  const { code, state, error } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const started = useRef(false);
  const [msg, setMsg] = useState("Connecting Gmail…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const back = () => void navigate({ to: "/ai-quote" });
    let expected: string | null = null;
    try {
      expected = sessionStorage.getItem(GMAIL_STATE_KEY);
      sessionStorage.removeItem(GMAIL_STATE_KEY);
    } catch {
      /* private mode */
    }
    if (error || !code) {
      toast.error(error === "access_denied" ? "Gmail access was declined" : "Gmail sign-in failed");
      return back();
    }
    if (!expected || expected !== state) {
      toast.error("Sign-in expired or was not started here. Try connecting again.");
      return back();
    }
    gmailConnect({ data: { code, redirectUri: `${location.origin}/gmail-callback` } })
      .then((r) => {
        toast.success(`Connected ${r.email}`);
        void qc.invalidateQueries({ queryKey: ["gmail-status"] });
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Could not connect Gmail"),
      )
      .finally(() => {
        setMsg("Done");
        back();
      });
  }, [code, state, error, navigate, qc]);

  return (
    <PageShell title="Gmail">
      <p className="py-16 text-center text-sm text-muted-foreground">{msg}</p>
    </PageShell>
  );
}
