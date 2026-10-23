import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, MessageCircle, Phone, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/bottom-nav";
import { Card, Chips, inputCls } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { QuoteDocument } from "@/components/quote-document";
import {
  addActivity,
  deleteQuote,
  getQuote,
  listActivities,
  setActivityDone,
  setQuoteStatus,
} from "@/data/api";
import { STATUS_LABELS, buildWhatsAppUrl, computeTotals } from "@/lib/quote";

export const Route = createFileRoute("/_authenticated/quotes/$id")({
  head: () => ({ meta: [{ title: "Quote — Tarko CRM" }] }),
  component: QuoteView,
});

type Kind = "call" | "visit" | "whatsapp" | "email" | "note" | "followup";
const KIND_LABELS: Record<Kind, string> = {
  call: "Call",
  visit: "Visit",
  whatsapp: "WhatsApp",
  email: "Email",
  note: "Note",
  followup: "Follow-up",
};
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

function QuoteView() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, error } = useQuery({
    queryKey: ["quote", id],
    queryFn: () => getQuote({ data: { id } }),
  });

  if (error)
    return (
      <PageShell title="Quote">
        <p className="text-destructive">{(error as Error).message}</p>
      </PageShell>
    );
  if (!data)
    return (
      <PageShell title="Quote">
        <div className="h-96 animate-pulse rounded-2xl bg-secondary" />
      </PageShell>
    );

  const { quote: q, brand, customer, lines } = data;
  const igst = !!q.igst;
  const t = computeTotals(lines, q.extra_charges, { inclusive: false, igst });

  const setStatus = async (status: string) => {
    try {
      await setQuoteStatus({ data: { id, status: status as "draft" } });
      qc.invalidateQueries({ queryKey: ["quote", id] });
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["activities", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  const remove = async () => {
    if (!confirm(`Delete ${q.quote_no}?`)) return;
    await deleteQuote({ data: { id } });
    qc.invalidateQueries({ queryKey: ["quotes"] });
    navigate({ to: "/dashboard" });
  };
  const termText = q.terms ? q.terms.split("\n").filter(Boolean) : [];
  const wa = buildWhatsAppUrl({
    quoteNo: q.quote_no,
    quoteDate: q.quote_date,
    customerName: customer?.name ?? null,
    customerPhone: customer?.phone ?? null,
    companyName: brand
      ? [brand.name, brand.tagline, brand.phone].filter(Boolean).join(" · ")
      : null,
    lines,
    totals: t,
    notes: [q.notes, ...termText].filter(Boolean).join("\n") || null,
  });

  return (
    <PageShell title={q.quote_no} wide>
      <div className="mx-auto grid max-w-md gap-4 md:max-w-5xl lg:max-w-none lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="min-w-0 space-y-3">
          <div className="no-print space-y-3">
            <div className="flex gap-2">
              <Button asChild className="h-12 flex-1 rounded-xl text-base font-semibold">
                <a
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => q.stage === "draft" && setStatus("sent")}
                >
                  <MessageCircle className="mr-2 h-5 w-5" /> Send on WhatsApp
                </a>
              </Button>
              <Button
                variant="outline"
                className="h-12 rounded-xl"
                onClick={() => window.print()}
                aria-label="Print or save PDF"
              >
                <Printer className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                className="h-12 rounded-xl"
                onClick={remove}
                aria-label="Delete quote"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
            <Chips
              label="Stage"
              value={q.stage}
              onChange={setStatus}
              options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </div>
          <QuoteDocument data={data} />
        </div>
        <div className="no-print lg:sticky lg:top-20">
          <ActivityPanel quoteId={id} phone={customer?.phone ?? null} />
        </div>
      </div>
    </PageShell>
  );
}

// Deal history and follow-ups: log what happened, schedule the next touch.
function ActivityPanel({ quoteId, phone }: { quoteId: string; phone: string | null }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["activities", quoteId],
    queryFn: () => listActivities({ data: { quoteId } }),
  });
  const [kind, setKind] = useState<Kind>("call");
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["activities", quoteId] });
    qc.invalidateQueries({ queryKey: ["followups"] });
  };

  async function log() {
    if (!text.trim() && !due)
      return void toast.error("Write what happened or pick a follow-up date");
    try {
      if (text.trim()) await addActivity({ data: { quoteId, kind, text, dueDate: null } });
      if (due)
        await addActivity({
          data: { quoteId, kind: "followup", text: text.trim() || "Follow up", dueDate: due },
        });
      setText("");
      setDue("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  const open = (data ?? []).filter((a) => a.due_date && !a.done);
  const history = (data ?? []).filter((a) => !(a.due_date && !a.done));

  return (
    <Card title="Activity & follow-ups">
      {phone && (
        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline" className="h-10 rounded-lg">
            <a href={`tel:${phone}`} onClick={() => setKind("call")}>
              <Phone className="mr-1 h-4 w-4" /> Call
            </a>
          </Button>
          <Button asChild variant="outline" className="h-10 rounded-lg">
            <a
              href={`https://wa.me/${phone.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setKind("whatsapp")}
            >
              <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
            </a>
          </Button>
        </div>
      )}

      {open.length > 0 && (
        <ul className="space-y-1.5">
          {open.map((a) => {
            const overdue = a.due_date! < today();
            return (
              <li
                key={a.id}
                className={`flex items-start gap-2 rounded-xl border p-2.5 text-sm ${overdue ? "border-rose-300 bg-rose-50" : "border-amber-300 bg-amber-50"}`}
              >
                <CalendarClock
                  className={`mt-0.5 h-4 w-4 shrink-0 ${overdue ? "text-rose-700" : "text-amber-700"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {a.due_date}
                    {overdue ? " · overdue" : a.due_date === today() ? " · today" : ""}
                  </span>
                  <span className="block text-muted-foreground">{a.text}</span>
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                  onClick={async () => {
                    await setActivityDone({ data: { id: a.id, done: true } });
                    refresh();
                  }}
                >
                  <Check className="h-3.5 w-3.5" /> Done
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2 rounded-xl border border-border p-3">
        <Chips<Kind>
          label="Activity type"
          value={kind}
          onChange={setKind}
          options={(["call", "visit", "whatsapp", "email", "note"] as Kind[]).map((k) => ({
            value: k,
            label: KIND_LABELS[k],
          }))}
        />
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What happened? e.g. Asked for 5% less on 110 mm"
          className="w-full rounded-xl border border-input bg-background p-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Follow up</span>
          {[
            ["Tomorrow", 1],
            ["3 days", 3],
            ["1 week", 7],
          ].map(([l, n]) => (
            <button
              key={l}
              type="button"
              onClick={() => setDue(plusDays(n as number))}
              className={`rounded-lg border px-2 py-1 text-xs font-semibold ${due === plusDays(n as number) ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
            >
              {l}
            </button>
          ))}
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className={`${inputCls} h-8 w-auto px-2 text-xs`}
            aria-label="Follow-up date"
          />
        </div>
        <Button className="h-10 w-full rounded-lg font-semibold" onClick={log}>
          Save activity
        </Button>
      </div>

      <ul className="space-y-2">
        {history.length === 0 && (
          <li className="text-sm text-muted-foreground">No activity yet.</li>
        )}
        {history.map((a) => (
          <li key={a.id} className="border-l-2 border-border pl-3 text-sm">
            <p className="text-xs text-muted-foreground">
              {KIND_LABELS[a.kind as Kind] ?? a.kind} ·{" "}
              {a.created_at.slice(0, 16).replace("T", " ")}
              {a.created_by ? ` · ${a.created_by}` : ""}
              {a.done && a.due_date ? " · follow-up done" : ""}
            </p>
            {a.text && <p>{a.text}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
