import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CalendarClock, ExternalLink, Phone, Plus } from "lucide-react";
import { toast } from "sonner";
import { recall, remember } from "@/lib/utils";
import { PageShell } from "@/components/bottom-nav";
import { Chips, StatusPill, inputCls } from "@/components/qq";
import { STAGES, STATUS_LABELS, fmtMoney, type Stage } from "@/lib/quote";
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
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [view, setViewState] = useState<"list" | "pipeline">(
    () => search.view ?? (recall("tarko.quotesView") === "pipeline" ? "pipeline" : "list"),
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
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
        <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-border bg-card p-4">
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
            <div className="rounded-2xl border border-border bg-card p-4">
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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chips
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "list" as const, label: "List" },
            { value: "pipeline" as const, label: "Pipeline" },
          ]}
        />
        <input
          placeholder="Search quote, customer or brand"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${inputCls} min-w-[12rem] flex-1 lg:max-w-sm`}
        />
      </div>
      {view === "list" && (
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
        <Pipeline
          rows={rows}
          enquiries={(enqs.data ?? []).filter((x) =>
            `${x.e.title} ${x.customer ?? ""}`.toLowerCase().includes(q.toLowerCase()),
          )}
          followUps={follow.data ?? []}
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

type FollowUp = Awaited<ReturnType<typeof listFollowUps>>[number];

// Deal board. Desktop: drag a card to another column. Phone: stage tabs + "Move to" on each card.
type Enq = Awaited<ReturnType<typeof listEnquiries>>[number];
type Col = "enquiry" | Stage;
const COLS: Col[] = ["enquiry", ...STAGES];
const COL_LABEL = (c: Col) => (c === "enquiry" ? "Enquiry" : STATUS_LABELS[c]!);

// Deal board. Enquiry column first (deals before a quote). Desktop: drag between columns
// (enquiry → a quote stage starts a quote from it). Phone: stage tabs + a move menu per card.
function Pipeline({
  rows,
  enquiries,
  followUps,
  onMove,
  onOpenEnquiry,
  onNewEnquiry,
  onConvert,
  onEnquiryLost,
}: {
  rows: QRow[];
  enquiries: Enq[];
  followUps: FollowUp[];
  onMove: (id: string, s: Stage) => void;
  onOpenEnquiry: (e: Enq) => void;
  onNewEnquiry: () => void;
  onConvert: (id: string) => void;
  onEnquiryLost: (id: string) => void;
}) {
  const [mobileStage, setMobileStage] = useState<Col>("enquiry");
  const [over, setOver] = useState<Col | null>(null);
  const nextFollow = (pick: (f: FollowUp) => boolean) => followUps.find(pick)?.a.due_date;
  const today = new Date().toISOString().slice(0, 10);
  const openEnq = enquiries.filter((e) => e.e.status === "open");
  const col = (s: Stage) => rows.filter((r) => r.status === s);
  const colValue = (c: Col) =>
    c === "enquiry"
      ? openEnq.reduce((t, e) => t + e.e.expected_value, 0)
      : col(c).reduce((t, r) => t + r.total, 0);
  const colCount = (c: Col) => (c === "enquiry" ? openEnq.length : col(c).length);
  const COLORS: Record<Col, string> = {
    enquiry: "border-t-violet-500",
    draft: "border-t-slate-400",
    sent: "border-t-sky-500",
    negotiation: "border-t-amber-500",
    won: "border-t-emerald-600",
    lost: "border-t-rose-500",
  };
  const badge = (fu?: string | null) =>
    fu ? (
      <span
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${fu < today ? "bg-rose-100 text-rose-800" : fu === today ? "bg-amber-100 text-amber-800" : "bg-secondary text-muted-foreground"}`}
      >
        <CalendarClock className="h-3 w-3" /> {fu.slice(5)}
      </span>
    ) : null;

  const quoteCard = (r: QRow, mobile = false) => (
    <div
      key={r.id}
      draggable={!mobile}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", `q:${r.id}`)}
      className="cursor-grab rounded-xl border border-border bg-card p-3 shadow-sm active:cursor-grabbing"
    >
      <Link to="/quotes/$id" params={{ id: r.id }} className="block">
        <p className="truncate text-sm font-semibold">{r.customer_name ?? "Walk-in"}</p>
        <p className="text-xs text-muted-foreground">
          {r.quote_no} · {r.brand_name}
        </p>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-base font-bold tabular-nums">{fmtMoney(r.total)}</span>
          {badge(nextFollow((f) => f.a.quote_id === r.id))}
        </div>
      </Link>
      {mobile && (
        <select
          aria-label="Move to stage"
          value={r.status}
          onChange={(e) => onMove(r.id, e.target.value as Stage)}
          className="mt-2 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              Move to: {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  const enquiryCard = (en: Enq, mobile = false) => (
    <div
      key={en.e.id}
      draggable={!mobile}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", `e:${en.e.id}`)}
      className="cursor-grab rounded-xl border border-violet-200 bg-card p-3 shadow-sm active:cursor-grabbing"
    >
      <button type="button" onClick={() => onOpenEnquiry(en)} className="block w-full text-left">
        <p className="truncate text-sm font-semibold">{en.customer ?? "New customer"}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{en.e.title}</p>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-base font-bold tabular-nums">
            {en.e.expected_value ? fmtMoney(en.e.expected_value) : "—"}
          </span>
          {badge(nextFollow((f) => f.a.enquiry_id === en.e.id))}
        </div>
      </button>
      {mobile && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-9 rounded-lg text-xs"
            onClick={() => onConvert(en.e.id)}
          >
            Create quote
          </Button>
          <Button
            variant="ghost"
            className="h-9 rounded-lg text-xs"
            onClick={() => onEnquiryLost(en.e.id)}
          >
            Mark lost
          </Button>
        </div>
      )}
    </div>
  );

  const drop = (c: Col, payload: string) => {
    const [kind, id] = payload.split(":") as ["q" | "e", string];
    if (!id) return;
    if (kind === "q") {
      if (c === "enquiry") return void toast.message("Quotes can't go back to Enquiry.");
      onMove(id, c);
    } else if (c === "lost") onEnquiryLost(id);
    else if (c !== "enquiry") onConvert(id);
  };

  return (
    <>
      {/* phone */}
      <div className="space-y-3 lg:hidden">
        <Chips<Col>
          label="Stage"
          value={mobileStage}
          onChange={setMobileStage}
          options={COLS.map((c) => ({
            value: c,
            label: COL_LABEL(c),
            sub: `${colCount(c)} · ${fmtMoney(colValue(c))}`,
          }))}
        />
        {mobileStage === "enquiry" && (
          <Button
            variant="outline"
            className="h-11 w-full rounded-xl border-dashed"
            onClick={onNewEnquiry}
          >
            <Plus className="mr-1 h-4 w-4" /> New enquiry
          </Button>
        )}
        {colCount(mobileStage) === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No deals in this stage.</p>
        )}
        {mobileStage === "enquiry"
          ? openEnq.map((e) => enquiryCard(e, true))
          : col(mobileStage).map((r) => quoteCard(r, true))}
      </div>
      {/* desktop */}
      <div className="hidden gap-3 lg:grid lg:grid-cols-6">
        {COLS.map((c) => (
          <div
            key={c}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(c);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              drop(c, e.dataTransfer.getData("text/plain"));
            }}
            className={`flex min-h-[60vh] flex-col rounded-2xl border border-t-4 border-border bg-secondary/40 ${COLORS[c]} ${over === c ? "ring-2 ring-primary" : ""}`}
          >
            <div className="flex items-start justify-between gap-1 px-3 pt-3">
              <div>
                <p className="text-sm font-semibold">{COL_LABEL(c)}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {fmtMoney(colValue(c))} · {colCount(c)}
                </p>
              </div>
              {c === "enquiry" && (
                <button
                  type="button"
                  onClick={onNewEnquiry}
                  className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                >
                  <Plus className="h-3.5 w-3.5" /> Deal
                </button>
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {c === "enquiry"
                ? openEnq.map((e) => enquiryCard(e))
                : col(c).map((r) => quoteCard(r))}
            </div>
          </div>
        ))}
      </div>
    </>
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
