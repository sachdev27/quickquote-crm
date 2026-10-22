import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { PageShell } from "@/components/bottom-nav";
import { Chips, StatusPill, inputCls } from "@/components/qq";
import { STATUS_LABELS, fmtMoney } from "@/lib/quote";
import { listQuotes } from "@/data/api";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Quotes — Tarko CRM" }] }),
  component: Dashboard,
});

function Dashboard() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const quotes = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes(), staleTime: 30_000 });

  const all = quotes.data ?? [];
  const rows = all.filter(
    (r) => (status === "all" || r.status === status) && `${r.quote_no} ${r.customer_name ?? ""} ${r.brand_name ?? ""}`.toLowerCase().includes(q.toLowerCase())
  );
  const sum = (f: (s: string) => boolean) => all.filter((r) => f(r.status)).reduce((s, r) => s + r.total, 0);

  return (
    <PageShell title="Quotes">
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Open" value={fmtMoney(sum((s) => s === "draft" || s === "sent"))} />
        <Stat label="Won" value={fmtMoney(sum((s) => s === "won"))} tone="text-emerald-700" />
      </div>
      <input placeholder="Search quote, customer or brand" value={q} onChange={(e) => setQ(e.target.value)} className={`${inputCls} mb-3`} />
      <div className="mb-4">
        <Chips
          label="Status filter"
          value={status}
          onChange={setStatus}
          options={[{ value: "all", label: "All" }, ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))]}
        />
      </div>

      {quotes.isLoading && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-secondary" />)}</div>}
      {quotes.error && <p className="text-sm text-destructive">{(quotes.error as Error).message}</p>}
      {quotes.data && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-semibold">{all.length ? "No matching quotes" : "No quotes yet"}</p>
          {!all.length && (
            <Link to="/new-quote" className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground">
              <Plus className="h-4 w-4" /> Create your first quote
            </Link>
          )}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <Link key={r.id} to="/quotes/$id" params={{ id: r.id }} preload="intent" className="rounded-2xl border border-border bg-card p-4 transition active:scale-[0.99] active:bg-secondary">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">{r.quote_no}</span>
              <StatusPill status={r.status} label={STATUS_LABELS[r.status] ?? r.status} />
            </div>
            <p className="mt-1 truncate font-semibold">{r.customer_name ?? "Walk-in customer"}</p>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">{r.brand_name} · {r.quote_date}</span>
              <span className="text-xl font-bold tabular-nums">{fmtMoney(r.total)}</span>
            </div>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
