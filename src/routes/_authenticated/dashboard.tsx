import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Columns3,
  ExternalLink,
  List,
  Phone,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { recall, remember } from "@/lib/utils";
import { PageShell } from "@/components/bottom-nav";
import { Chips, StatusPill, inputCls, inputSm } from "@/components/qq";
import { KanbanBoard } from "@/components/kanban-board";
import { STATUS_LABELS, fmtMoney, type Stage } from "@/lib/quote";
import {
  getQuote,
  listEnquiries,
  listFollowUps,
  listQuotes,
  setEnquiryStatus,
  setQuoteStatus,
} from "@/data/api";
import { EnquiryDialog } from "@/components/enquiry-dialog";
import { QuoteDocument } from "@/components/quote-document";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { view?: "list" | "pipeline"; enquiry?: string } => ({
    ...(s["view"] === "pipeline" || s["view"] === "list" ? { view: s["view"] } : {}),
    ...(typeof s["enquiry"] === "string" ? { enquiry: s["enquiry"] } : {}),
  }),
  head: () => ({ meta: [{ title: "Quotes — Tarko CRM" }] }),
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [brand, setBrand] = useState("all");
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [view, setViewState] = useState<"list" | "pipeline">(
    () => search.view ?? (recall("tarko.quotesView") === "list" ? "list" : "pipeline"),
  );
  const enqs = useQuery({
    queryKey: ["enquiries"],
    queryFn: () => listEnquiries(),
    staleTime: 30_000,
  });
  const [enqOpen, setEnqOpen] = useState<null | { e: Enq | null }>(null);
  // deep link (search, activities): open that enquiry
  useEffect(() => {
    if (!search.enquiry || !enqs.data) return;
    const hit = enqs.data.find((x) => x.e.id === search.enquiry);
    if (hit) setEnqOpen({ e: hit });
    navigate({ to: "/dashboard", search: { view: "pipeline" }, replace: true });
  }, [search.enquiry, enqs.data, navigate]);
  const convert = (id: string) => navigate({ to: "/new-quote", search: { enquiry: id } });
  const enquiryLost = async (id: string) => {
    await setEnquiryStatus({ data: { id, status: "lost" } });
    qc.invalidateQueries({ queryKey: ["enquiries"] });
    toast.success("Enquiry marked lost");
  };
  // Follow-ups and brand insights are collapsed by default so the board stays in view.
  const [insightsOpen, setInsightsOpen] = useState(() => recall("tarko.insights") === "open");
  const toggleInsights = () => {
    remember("tarko.insights", insightsOpen ? "closed" : "open");
    setInsightsOpen(!insightsOpen);
  };
  const setView = (v: "list" | "pipeline") => {
    setViewState(v);
    remember("tarko.quotesView", v);
  };
  const quotes = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes(), staleTime: 30_000 });
  const follow = useQuery({
    queryKey: ["followups"],
    queryFn: () => listFollowUps(),
    staleTime: 30_000,
  });

  const all = quotes.data ?? [];
  const brands = [
    ...new Set(
      [...all.map((r) => r.brand_name), ...(enqs.data ?? []).map((e) => e.brand)].filter(
        (b): b is string => !!b,
      ),
    ),
  ].sort();
  const rows = all.filter(
    (r) =>
      (status === "all" || view === "pipeline" || r.status === status) &&
      `${r.quote_no} ${r.customer_name ?? ""} ${r.brand_name ?? ""}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );

  // KPIs
  const month = new Date().toISOString().slice(0, 7);
  const open = all.filter((r) => ["draft", "sent", "negotiation"].includes(r.status));
  const wonMonth = all.filter((r) => r.status === "won" && r.quote_date.startsWith(month));
  const closed = all.filter((r) => r.status === "won" || r.status === "lost");
  const conversion = closed.length
    ? Math.round((closed.filter((r) => r.status === "won").length / closed.length) * 100)
    : null;
  const today = new Date().toISOString().slice(0, 10);
  const due = (follow.data ?? []).filter((f) => f.a.due_date! <= today);
  const byBrand = Object.entries(
    wonMonth.reduce<Record<string, number>>(
      (m, r) => ({ ...m, [r.brand_name ?? "—"]: (m[r.brand_name ?? "—"] ?? 0) + r.total }),
      {},
    ),
  ).sort((x, y) => y[1] - x[1]);
  const maxBrand = Math.max(1, ...byBrand.map(([, v]) => v));

  async function move(id: string, stage: Stage) {
    // optimistic: card jumps column immediately
    qc.setQueryData(["quotes"], (old: typeof all | undefined) =>
      old?.map((r) => (r.id === id ? { ...r, status: stage } : r)),
    );
    try {
      await setQuoteStatus({ data: { id, status: stage } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move");
    }
    qc.invalidateQueries({ queryKey: ["quotes"] });
  }

  return (
    <PageShell title="Quotes" wide>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:mb-2 lg:grid-cols-4 lg:gap-2">
        <Stat
          label={`Pipeline · ${open.length} open`}
          value={fmtMoney(open.reduce((s, r) => s + r.total, 0))}
        />
        <Stat
          label={`Won this month · ${wonMonth.length}`}
          value={fmtMoney(wonMonth.reduce((s, r) => s + r.total, 0))}
          tone="text-emerald-700"
        />
        <Stat
          label="Conversion (won / closed)"
          value={conversion == null ? "—" : `${conversion}%`}
        />
        <Stat
          label="Follow-ups due"
          value={String(due.length)}
          tone={due.length ? "text-amber-700" : ""}
        />
      </div>

      {(due.length > 0 || byBrand.length > 0) && (
        <button
          type="button"
          onClick={toggleInsights}
          aria-expanded={insightsOpen}
          className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground lg:mb-1.5 lg:text-xs"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${insightsOpen ? "" : "-rotate-90"}`}
          />
          Follow-ups &amp; brand insights
          {due.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {due.length} due
            </span>
          )}
        </button>
      )}
      {insightsOpen && (due.length > 0 || byBrand.length > 0) && (
        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Today's follow-ups
            </p>
            {due.length === 0 && <p className="text-sm text-muted-foreground">Nothing due. 🎉</p>}
            <ul className="divide-y divide-border/60">
              {due.slice(0, 8).map((f) => (
                <li key={f.a.id} className="flex items-center gap-3 py-2 text-sm">
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold ${f.a.due_date! < today ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}
                  >
                    {f.a.due_date! < today ? "Overdue" : "Today"}
                  </span>
                  {f.a.quote_id ? (
                    <Link
                      to="/quotes/$id"
                      params={{ id: f.a.quote_id }}
                      className="min-w-0 flex-1 truncate hover:text-primary"
                    >
                      <b>{f.customer ?? "Walk-in"}</b> · {f.quote_no} ·{" "}
                      <span className="text-muted-foreground">{f.a.text}</span>
                    </Link>
                  ) : (
                    <Link
                      to={f.a.enquiry_id ? "/dashboard" : "/activities"}
                      search={f.a.enquiry_id ? { view: "pipeline", enquiry: f.a.enquiry_id } : {}}
                      className="min-w-0 flex-1 truncate hover:text-primary"
                    >
                      <b>{f.customer ?? "No customer"}</b>
                      {f.enquiry ? ` · ${f.enquiry}` : ""} ·{" "}
                      <span className="text-muted-foreground">{f.a.text}</span>
                    </Link>
                  )}
                  {f.phone && (
                    <a
                      href={`tel:${f.phone}`}
                      aria-label="Call"
                      className="rounded-full bg-secondary p-2 text-primary"
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
          {byBrand.length > 0 && (
            <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Won this month by brand
              </p>
              <ul className="space-y-2">
                {byBrand.map(([b, v]) => (
                  <li key={b} className="text-sm">
                    <div className="flex justify-between tabular-nums">
                      <span>{b}</span>
                      <b>{fmtMoney(v)}</b>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-secondary">
                      <div
                        className="h-1.5 rounded-full bg-emerald-600"
                        style={{ width: `${(v / maxBrand) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2 lg:mb-2">
        <div
          role="radiogroup"
          aria-label="View"
          className="inline-flex h-12 shrink-0 rounded-xl border border-border bg-card p-1 lg:h-8 lg:rounded-lg lg:p-0.5"
        >
          {(
            [
              ["pipeline", "Board", Columns3],
              ["list", "List", List],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors lg:rounded-md lg:px-2.5 lg:text-[13px] ${
                view === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        <input
          placeholder="Search quote, customer or brand"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${inputSm} min-w-[12rem] flex-1 lg:max-w-xs`}
        />
        {view === "pipeline" && brands.length > 1 && (
          <div className="hidden items-center gap-1 lg:flex" role="radiogroup" aria-label="Brand">
            {["all", ...brands].map((b) => (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={brand === b}
                onClick={() => setBrand(b)}
                className={`h-8 rounded-lg border px-2.5 text-[13px] font-semibold transition-colors ${
                  brand === b
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {b === "all" ? "All brands" : b}
              </button>
            ))}
          </div>
        )}
      </div>
      {view === "list" && (
        <div className="mb-4 lg:mb-2">
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
      )}

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
      {quotes.data && all.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-semibold">No quotes yet</p>
          <Link
            to="/new-quote"
            className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Create your first quote
          </Link>
        </div>
      )}

      {view === "pipeline" ? (
        <KanbanBoard
          rows={rows}
          enquiries={(enqs.data ?? []).filter((x) =>
            `${x.e.title} ${x.customer ?? ""}`.toLowerCase().includes(q.toLowerCase()),
          )}
          followUps={follow.data ?? []}
          brand={brand}
          onMove={move}
          onOpenEnquiry={(e) => setEnqOpen({ e })}
          onNewEnquiry={() => setEnqOpen({ e: null })}
          onConvert={convert}
          onEnquiryLost={enquiryLost}
        />
      ) : (
        <>
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
                <p className="mt-1 truncate font-semibold">
                  {r.customer_name ?? "Walk-in customer"}
                </p>
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
        </>
      )}
      <EnquiryDialog
        open={!!enqOpen}
        onOpenChange={(o) => !o && setEnqOpen(null)}
        enquiry={enqOpen?.e ?? null}
      />
    </PageShell>
  );
}

type Enq = Awaited<ReturnType<typeof listEnquiries>>[number];

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
    <div className="rounded-2xl border border-border bg-card p-4 lg:flex lg:items-baseline lg:justify-between lg:gap-2 lg:rounded-lg lg:px-3 lg:py-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold tabular-nums lg:text-base ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
