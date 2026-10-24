import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, Paperclip, Search, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { gmailAuthUrl, gmailDisconnect, gmailExtract, gmailList, gmailStatus } from "@/data/gmail";
import type { Extraction } from "@/lib/ai/inbound";

const STATE_KEY = "qq-gmail-state"; // same key the callback page checks

export type GmailResult = {
  extraction: Extraction;
  subject: string;
  from: string;
  files: string[];
};

export function GmailInbox({ onExtracted }: { onExtracted: (r: GmailResult) => void }) {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["gmail-status"],
    queryFn: () => gmailStatus(),
    staleTime: 60_000,
  });
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [all, setAll] = useState(false);
  const connected = !!status.data?.email;

  const list = useQuery({
    queryKey: ["gmail-list", term, all],
    queryFn: () => gmailList({ data: { q: term, all } }),
    enabled: connected,
    staleTime: 30_000,
    retry: false,
  });

  const connect = useMutation({
    mutationFn: async () => {
      const state = crypto.randomUUID();
      sessionStorage.setItem(STATE_KEY, state);
      const { url } = await gmailAuthUrl({
        data: { redirectUri: `${location.origin}/gmail-callback`, state },
      });
      location.href = url;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not start sign-in"),
  });
  const disconnect = useMutation({
    mutationFn: () => gmailDisconnect(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["gmail-status"] }),
  });
  const use = useMutation({
    mutationFn: (id: string) => gmailExtract({ data: { id } }),
    onSuccess: (r) => onExtracted(r),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not read that email"),
  });

  if (status.isLoading) return <div className="h-40 animate-pulse rounded-xl bg-secondary" />;
  const s = status.data;
  if (!s) return <p className="text-sm text-muted-foreground">Could not load Gmail status.</p>;

  if (!s.configured)
    return (
      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
        Gmail is not set up yet. Add <code>GOOGLE_CLIENT_ID</code> and{" "}
        <code>GOOGLE_CLIENT_SECRET</code> as secrets in Cloudflare (see the README), then reload.
      </p>
    );

  if (!connected)
    return (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          Connect <b>{s.account}</b> to pull enquiry emails straight into AI Quote. Read-only: the
          CRM can never send, delete or change mail.
        </p>
        {s.isAdmin ? (
          <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
            <Mail className="h-4 w-4" /> Connect {s.account}
          </Button>
        ) : (
          <p className="text-xs text-amber-600">Ask an admin to connect it.</p>
        )}
      </div>
    );

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(q);
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sender or subject"
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <Button type="submit" variant="outline" size="sm">
          Search
        </Button>
      </form>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {s.isAdmin ? (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            Whole inbox (otherwise only the &ldquo;{s.label}&rdquo; label)
          </label>
        ) : (
          <span>
            Showing label &ldquo;{s.label}&rdquo; of {s.email}
          </span>
        )}
        {s.isAdmin && (
          <button
            className="inline-flex items-center gap-1 hover:text-foreground"
            onClick={() => disconnect.mutate()}
          >
            <Unplug className="h-3 w-3" /> Disconnect
          </button>
        )}
      </div>

      {list.isLoading && <div className="h-32 animate-pulse rounded-xl bg-secondary" />}
      {list.error && (
        <p className="text-xs text-destructive">
          {list.error instanceof Error ? list.error.message : "Could not load the inbox"}
        </p>
      )}
      {list.data && !list.data.length && (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No emails found. In Gmail, give the label &ldquo;{s.label}&rdquo; to the enquiries you
          want here.
        </p>
      )}
      <ul className="divide-y divide-border">
        {list.data?.map((m) => (
          <li key={m.id} className="flex items-start gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.subject}</p>
              <p className="truncate text-xs text-muted-foreground">
                {m.from.replace(/<.*>/, "").trim() || m.from} · {new Date(m.date).toLocaleString()}
              </p>
              <p className="line-clamp-1 text-xs text-muted-foreground">{m.snippet}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={use.isPending}
              onClick={() => use.mutate(m.id)}
            >
              {use.isPending && use.variables === m.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
              Use
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
