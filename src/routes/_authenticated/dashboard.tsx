import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink, Plus } from "lucide-react";
import { PageShell } from "@/components/bottom-nav";
import { Chips, StatusPill, inputCls } from "@/components/qq";
import { STATUS_LABELS, fmtMoney } from "@/lib/quote";
import { getQuote, listQuotes } from "@/data/api";
import { QuoteDocument } from "@/components/quote-document";
import { Button } from "@/components/ui/button";

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
    (r) =>
      (status === "all" || r.status === status) &&
      `${r.quote_no} ${r.customer_name ?? ""} ${r.brand_name ?? ""}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  const sum = (f: (s: string) => boolean) =>
    all.filter((r) => f(r.status)).reduce((s, r) => s + r.total, 0);

  return (
    <PageShell title="Quotes" wide>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Open" value={fmtMoney(sum((s) => s === "draft" || s === "sent"))} />
        <Stat label="Won" value={fmtMoney(sum((s) => s === "won"))} tone="text-emerald-700" />
      </div>
      <input
        placeholder="Search quote, customer or brand"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className={`${inputCls} mb-3`}
      />
      <div className="mb-4">
        <Chips
          label="Status filter"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All" },
            ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>

      {quotes.isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-secondary" />
          ))}
        </div>
      )}
      {quotes.error && (
        <p className="text-sm text-destructive">{(quotes.error as Error).message}</p>
      )}
      {quotes.data && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-semibold">{all.length ? "No matching quotes" : "No quotes yet"}</p>
          {!all.length && (
            <Link
              to="/new-quote"
              className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Create your first quote
            </Link>
          )}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 lg:hidden">
        {rows.map((r) => (
          <Link
            key={r.id}
            to="/quotes/$id"
            params={{ id: r.id }}
            preload="intent"
            className="rounded-2xl border border-border bg-card p-4 transition active:scale-[0.99] active:bg-secondary"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">{r.quote_no}</span>
              <StatusPill status={r.status} label={STATUS_LABELS[r.status] ?? r.status} />
            </div>
            <p className="mt-1 truncate font-semibold">{r.customer_name ?? "Walk-in customer"}</p>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">
                {r.brand_name} · {r.quote_date}
              </span>
              <span className="text-xl font-bold tabular-nums">{fmtMoney(r.total)}</span>
            </div>
          </Link>
        ))}
      </div>

      {rows.length > 0 && <DesktopQuotes rows={rows} />}
    </PageShell>
  );
}

type QRow = Awaited<ReturnType<typeof listQuotes>>[number];
type SortKey = "quote_no" | "quote_date" | "customer_name" | "brand_name" | "total" | "status";

// Desktop: sortable table; clicking a row previews the quote alongside instead of navigating away.
function DesktopQuotes({ rows }: { rows: QRow[] }) {
  const [sel, setSel] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({
    key: "quote_date",
    asc: false,
  });
  const sorted = useMemo(() => {
    const v = (r: QRow) => r[sort.key] ?? "";
    return [...rows].sort((a, b) => (v(a) < v(b) ? -1 : v(a) > v(b) ? 1 : 0) * (sort.asc ? 1 : -1));
  }, [rows, sort]);
  const current = sel || sorted[0]?.id || "";
  const preview = useQuery({
    queryKey: ["quote", current],
    queryFn: () => getQuote({ data: { id: current } }),
    enabled: !!current,
  });
  const th = (key: SortKey, label: string, right = false) => (
    <th className={`py-2 px-2 font-semibold ${right ? "text-right" : ""}`}>
      <button
        type="button"
        className="inline-flex items-center gap-1 uppercase hover:text-foreground"
        onClick={() => setSort({ key, asc: sort.key === key ? !sort.asc : true })}
      >
        {label}
        {sort.key === key &&
          (sort.asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
  return (
    <div className="hidden gap-4 lg:grid lg:grid-cols-2 lg:items-start">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full tabular-nums">
          <thead className="border-b border-border bg-secondary/50 text-left text-xs tracking-wide text-muted-foreground">
            <tr>
              {th("quote_no", "Quote")}
              {th("quote_date", "Date")}
              {th("customer_name", "Customer")}
              {th("brand_name", "Brand")}
              {th("total", "Total", true)}
              {th("status", "Status")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.id}
                onClick={() => setSel(r.id)}
                className={`cursor-pointer whitespace-nowrap border-b border-border/50 text-sm ${r.id === current ? "bg-primary/10" : "hover:bg-secondary/50"}`}
              >
                <td className="px-2 py-2.5 font-semibold">{r.quote_no}</td>
                <td className="px-2 text-muted-foreground">{r.quote_date}</td>
                <td className="px-2">
                  {r.customer_name ?? <span className="text-muted-foreground">Walk-in</span>}
                </td>
                <td className="px-2 text-muted-foreground">{r.brand_name}</td>
                <td className="px-2 text-right font-semibold">{fmtMoney(r.total)}</td>
                <td className="px-2">
                  <StatusPill status={r.status} label={STATUS_LABELS[r.status] ?? r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sticky top-20 space-y-2">
        {current && (
          <div className="flex justify-end">
            <Button asChild variant="outline" className="h-9 rounded-lg">
              <Link to="/quotes/$id" params={{ id: current }}>
                <ExternalLink className="mr-1 h-4 w-4" /> Open · WhatsApp · print
              </Link>
            </Button>
          </div>
        )}
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl">
          {preview.data ? (
            <QuoteDocument data={preview.data} />
          ) : (
            <div className="h-96 animate-pulse rounded-2xl bg-secondary" />
          )}
        </div>
      </div>
    </div>
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
