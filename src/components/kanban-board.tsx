import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  CalendarClock,
  Clock,
  ExternalLink,
  FilePlus2,
  MoreHorizontal,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Chips } from "@/components/qq";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { listEnquiries, listFollowUps, listQuotes } from "@/data/api";
import { ageLabel, daysSince, hueOf, initialsOf, staleness } from "@/lib/board";
import { STAGES, STATUS_LABELS, fmtMoney, type Stage } from "@/lib/quote";

type QRow = Awaited<ReturnType<typeof listQuotes>>[number];
type Enq = Awaited<ReturnType<typeof listEnquiries>>[number];
type FollowUp = Awaited<ReturnType<typeof listFollowUps>>[number];
type Col = "enquiry" | Stage;

const COLS: Col[] = ["enquiry", ...STAGES];
const LABEL = (c: Col) => (c === "enquiry" ? "Enquiry" : STATUS_LABELS[c]!);
const HINT: Record<Col, string> = {
  enquiry: "Calls and visits before a quote",
  draft: "Being prepared",
  sent: "Waiting for the customer",
  negotiation: "Price talks",
  won: "Closed, won",
  lost: "Closed, lost",
};
const DOT: Record<Col, string> = {
  enquiry: "bg-violet-500",
  draft: "bg-slate-400",
  sent: "bg-sky-500",
  negotiation: "bg-amber-500",
  won: "bg-emerald-600",
  lost: "bg-rose-500",
};
const TOP: Record<Col, string> = {
  enquiry: "border-t-violet-500",
  draft: "border-t-slate-400",
  sent: "border-t-sky-500",
  negotiation: "border-t-amber-500",
  won: "border-t-emerald-600",
  lost: "border-t-rose-500",
};
const CLOSED_SHOWN = 8; // Won / Lost columns show the latest few; the rest are one click away

const today = () => new Date().toISOString().slice(0, 10);

// Deal board. Enquiry column first (deals before a quote exists). Desktop: drag between columns
// (enquiry → a quote stage starts a quote from it). Phone: stage tabs and a move menu per card.
export function KanbanBoard({
  rows,
  enquiries,
  followUps,
  brand,
  onMove,
  onDelete,
  onOpenEnquiry,
  onNewEnquiry,
  onConvert,
  onEnquiryLost,
}: {
  rows: QRow[];
  enquiries: Enq[];
  followUps: FollowUp[];
  brand: string; // "all" or a brand name (chosen in the page toolbar)
  onMove: (id: string, s: Stage) => void;
  onDelete: (id: string) => void;
  onOpenEnquiry: (e: Enq) => void;
  onNewEnquiry: () => void;
  onConvert: (id: string) => void;
  onEnquiryLost: (id: string) => void;
}) {
  const [mobileStage, setMobileStage] = useState<Col>("enquiry");
  const [over, setOver] = useState<Col | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [showAll, setShowAll] = useState<Partial<Record<Col, boolean>>>({});
  const now = Date.now();
  const t = today();

  const rowsB = brand === "all" ? rows : rows.filter((r) => r.brand_name === brand);
  const openEnq = enquiries
    .filter((e) => e.e.status === "open")
    .filter((e) => brand === "all" || e.brand === brand);
  const col = (s: Stage) => rowsB.filter((r) => r.status === s);
  const count = (c: Col) => (c === "enquiry" ? openEnq.length : col(c).length);
  const value = (c: Col) =>
    c === "enquiry"
      ? openEnq.reduce((s, e) => s + e.e.expected_value, 0)
      : col(c).reduce((s, r) => s + r.total, 0);
  const nextFollow = (pick: (f: FollowUp) => boolean) => followUps.find(pick)?.a.due_date;

  const followBadge = (fu?: string | null) =>
    fu ? (
      <span
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
          fu < t
            ? "bg-rose-100 text-rose-800"
            : fu === t
              ? "bg-amber-100 text-amber-800"
              : "bg-secondary text-muted-foreground"
        }`}
        title={fu < t ? "Follow-up overdue" : fu === t ? "Follow-up today" : "Next follow-up"}
      >
        <CalendarClock className="h-3 w-3" />{" "}
        {fu < t ? "Overdue" : fu === t ? "Today" : fu.slice(5)}
      </span>
    ) : null;

  const ageBadge = (iso: string, watch: boolean) => {
    const d = daysSince(iso, now);
    const s = watch ? staleness(d) : "fresh";
    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] tabular-nums ${
          s === "stale"
            ? "font-semibold text-rose-700"
            : s === "slow"
              ? "text-amber-700"
              : "text-muted-foreground"
        }`}
        title={`${d} day${d === 1 ? "" : "s"} since last update`}
      >
        <Clock className="h-3 w-3" /> {ageLabel(d)}
      </span>
    );
  };

  const avatar = (name: string | null) => {
    const h = hueOf(name);
    return (
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold"
        style={{ background: `hsl(${h} 70% 90%)`, color: `hsl(${h} 50% 28%)` }}
      >
        {initialsOf(name)}
      </span>
    );
  };

  const menuBtn = (children: React.ReactNode) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Card actions"
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const quoteCard = (r: QRow, mobile = false) => (
    <div
      key={r.id}
      draggable={!mobile}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", `q:${r.id}`);
        e.dataTransfer.effectAllowed = "move";
        setDragging(r.id);
      }}
      onDragEnd={() => {
        setDragging(null);
        setOver(null);
      }}
      className={`group relative rounded-lg border border-border bg-card p-2.5 shadow-sm transition hover:shadow-md ${
        mobile ? "" : "cursor-grab active:cursor-grabbing"
      } ${dragging === r.id ? "opacity-40" : ""}`}
    >
      <Link to="/quotes/$id" params={{ id: r.id }} className="block pr-7">
        <div className="flex items-center gap-2">
          {avatar(r.customer_name)}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">
              {r.customer_name ?? "Walk-in"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {r.quote_no} · {r.brand_name}
            </p>
          </div>
        </div>
        <p className="mt-1.5 text-base font-bold tabular-nums leading-none">{fmtMoney(r.total)}</p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          {ageBadge(r.updated_at, ["draft", "sent", "negotiation"].includes(r.status))}
          {followBadge(nextFollow((f) => f.a.quote_id === r.id))}
        </div>
      </Link>
      <div className="absolute right-1.5 top-1.5">
        {menuBtn(
          <>
            <DropdownMenuItem asChild>
              <Link to="/quotes/$id" params={{ id: r.id }}>
                <ExternalLink className="mr-2 h-4 w-4" /> Open quote
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Move to</DropdownMenuLabel>
            {STAGES.filter((s) => s !== r.status).map((s) => (
              <DropdownMenuItem key={s} onSelect={() => onMove(r.id, s)}>
                <span className={`mr-2 size-2 rounded-full ${DOT[s]}`} /> {STATUS_LABELS[s]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onDelete(r.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete quote
            </DropdownMenuItem>
          </>,
        )}
      </div>
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
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", `e:${en.e.id}`);
        e.dataTransfer.effectAllowed = "move";
        setDragging(en.e.id);
      }}
      onDragEnd={() => {
        setDragging(null);
        setOver(null);
      }}
      className={`group relative rounded-lg border border-violet-200 bg-card p-2.5 shadow-sm transition hover:shadow-md ${
        mobile ? "" : "cursor-grab active:cursor-grabbing"
      } ${dragging === en.e.id ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        onClick={() => onOpenEnquiry(en)}
        className="block w-full pr-7 text-left"
      >
        <div className="flex items-center gap-2">
          {avatar(en.customer)}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">
              {en.customer ?? "New customer"}
            </p>
            <p className="truncate text-xs text-muted-foreground">{en.brand ?? "Any brand"}</p>
          </div>
        </div>
        <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{en.e.title}</p>
        <p className="mt-1 text-base font-bold tabular-nums leading-none">
          {en.e.expected_value ? fmtMoney(en.e.expected_value) : "—"}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          {ageBadge(en.e.updated_at, true)}
          {followBadge(nextFollow((f) => f.a.enquiry_id === en.e.id))}
        </div>
      </button>
      <div className="absolute right-1.5 top-1.5">
        {menuBtn(
          <>
            <DropdownMenuItem onSelect={() => onOpenEnquiry(en)}>
              <ExternalLink className="mr-2 h-4 w-4" /> Open enquiry
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onConvert(en.e.id)}>
              <FilePlus2 className="mr-2 h-4 w-4" /> Create quote
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onEnquiryLost(en.e.id)}>
              <XCircle className="mr-2 h-4 w-4" /> Mark lost
            </DropdownMenuItem>
          </>,
        )}
      </div>
      <Button
        variant="outline"
        className="mt-1.5 h-7 w-full rounded-md text-xs font-semibold"
        onClick={() => onConvert(en.e.id)}
      >
        <FilePlus2 className="mr-1 h-3.5 w-3.5" /> Create quote
      </Button>
    </div>
  );

  const drop = (c: Col, payload: string) => {
    const [kind, id] = payload.split(":") as ["q" | "e", string];
    if (!id) return;
    if (kind === "q") {
      if (c === "enquiry") return void toast.message("Quotes can't go back to Enquiry.");
      const cur = rows.find((r) => r.id === id);
      if (cur?.status !== c) onMove(id, c);
    } else if (c === "lost") onEnquiryLost(id);
    else if (c !== "enquiry") onConvert(id);
  };

  const cardsOf = (c: Col, mobile = false) => {
    if (c === "enquiry") return openEnq.map((e) => enquiryCard(e, mobile));
    const all = col(c);
    const closed = c === "won" || c === "lost";
    const list = closed && !showAll[c] && !mobile ? all.slice(0, CLOSED_SHOWN) : all;
    return list.map((r) => quoteCard(r, mobile));
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
            label: LABEL(c),
            sub: `${count(c)} · ${fmtMoney(value(c))}`,
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
        {count(mobileStage) === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No deals in this stage.</p>
        )}
        {cardsOf(mobileStage, true)}
      </div>

      {/* desktop: columns scroll sideways if the window is narrow */}
      <div className="hidden auto-cols-[minmax(14rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2 lg:grid">
        {COLS.map((c) => {
          const closed = c === "won" || c === "lost";
          const hidden = closed && !showAll[c] ? Math.max(0, count(c) - CLOSED_SHOWN) : 0;
          return (
            <section
              key={c}
              aria-label={`${LABEL(c)} column`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(c);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                drop(c, e.dataTransfer.getData("text/plain"));
              }}
              className={`flex min-h-[62vh] flex-col rounded-2xl border border-t-4 lg:min-h-[calc(100vh-8.5rem)] lg:rounded-xl border-border bg-secondary/40 transition-colors ${TOP[c]} ${
                over === c ? "bg-primary/10 ring-2 ring-primary" : ""
              }`}
            >
              <header className="px-2.5 pb-1.5 pt-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`size-2.5 shrink-0 rounded-full ${DOT[c]}`} />
                    <h3 className="truncate text-sm font-semibold">{LABEL(c)}</h3>
                    <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                      {count(c)}
                    </span>
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
                <p className="text-sm font-bold tabular-nums" title={HINT[c]}>
                  {fmtMoney(value(c))}
                </p>
              </header>
              <div className="flex-1 space-y-1.5 overflow-y-auto px-1.5 pb-1.5">
                {count(c) === 0 && (
                  <p className="rounded-xl border border-dashed border-border/80 px-3 py-6 text-center text-xs text-muted-foreground">
                    {over === c ? "Drop here" : "No deals"}
                  </p>
                )}
                {cardsOf(c)}
                {closed && (hidden > 0 || showAll[c]) && count(c) > CLOSED_SHOWN && (
                  <button
                    type="button"
                    onClick={() => setShowAll({ ...showAll, [c]: !showAll[c] })}
                    className="w-full rounded-lg py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                  >
                    {showAll[c] ? "Show fewer" : `Show all ${count(c)}`}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
