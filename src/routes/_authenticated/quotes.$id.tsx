import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, MessageCircle, Phone, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/bottom-nav";
import { Card, Chips, inputCls } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { QuoteDocument } from "@/components/quote-document";
import { ActivityPanel } from "@/components/activity-panel";
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
          <ActivityPanel target={{ quoteId: id }} phone={customer?.phone ?? null} />
        </div>
      </div>
    </PageShell>
  );
}
