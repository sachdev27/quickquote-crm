import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Check,
  FileText,
  MessageCircle,
  Pencil,
  Phone,
  Printer,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/bottom-nav";
import { Card, Chips, inputCls } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { QuoteDocument } from "@/components/quote-document";
import { ActivityPanel } from "@/components/activity-panel";
import { QuoteHistory } from "@/components/quote-history";
import {
  addActivity,
  createInvoiceFromQuote,
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
    try {
      await deleteQuote({ data: { id } });
      qc.invalidateQueries({ queryKey: ["quotes"] });
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  };
  const issueInvoice = async () => {
    if (!confirm(`Create a tax invoice from ${q.quote_no}? The quotation will move to Won.`))
      return;
    try {
      const r = await createInvoiceFromQuote({ data: { quoteId: id } });
      for (const k of [["quote", id], ["quotes"], ["audit", id], ["invoices"], ["activities", id]])
        qc.invalidateQueries({ queryKey: k });
      navigate({ to: "/invoices/$id", params: { id: r.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the invoice");
    }
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
      {/* Desktop: actions, activity and history on the left, the document preview on the right. */}
      <div className="mx-auto grid max-w-md gap-4 md:max-w-5xl lg:max-w-none lg:grid-cols-[23rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-3 lg:gap-y-2">
        <div className="no-print space-y-3 lg:col-start-1 lg:row-start-1 lg:space-y-2">
          <div className="flex gap-2 lg:gap-1.5">
            <Button asChild className="h-12 flex-1 rounded-xl text-base font-semibold lg:text-sm">
              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
                onClick={() => q.stage === "draft" && setStatus("sent")}
              >
                <MessageCircle className="mr-2 h-5 w-5 lg:mr-1 lg:h-4 lg:w-4" /> Send on WhatsApp
              </a>
            </Button>
            <Button asChild variant="outline" className="h-12 rounded-xl">
              <Link
                to="/new-quote"
                search={{ edit: id }}
                aria-label="Edit quote"
                title="Edit quote"
                onClick={(e) => {
                  if (
                    data.invoice &&
                    !confirm(
                      `Tax invoice ${data.invoice.invoice_no} was already issued. Editing the quotation will not change it. Continue?`,
                    )
                  )
                    e.preventDefault();
                }}
              >
                <Pencil className="h-5 w-5 lg:h-4 lg:w-4" />
                <span className="hidden lg:inline">Edit</span>
              </Link>
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-xl"
              onClick={() => window.print()}
              aria-label="Print or save PDF"
              title="Print or save PDF"
            >
              <Printer className="h-5 w-5 lg:h-4 lg:w-4" />
              <span className="hidden lg:inline">Print</span>
            </Button>
            <Button
              variant="ghost"
              className="h-12 rounded-xl"
              onClick={remove}
              aria-label="Delete quote"
              title="Delete quote"
            >
              <Trash2 className="h-5 w-5 lg:h-4 lg:w-4" />
            </Button>
          </div>
          <Chips
            label="Stage"
            value={q.stage}
            onChange={setStatus}
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
          {data.invoice ? (
            <Button asChild variant="outline" className="h-11 w-full rounded-xl lg:h-8">
              <Link to="/invoices/$id" params={{ id: data.invoice.id }}>
                <FileText className="mr-1 h-4 w-4" /> Tax invoice {data.invoice.invoice_no}
              </Link>
            </Button>
          ) : (
            <Button
              variant="outline"
              className="h-11 w-full rounded-xl lg:h-8"
              onClick={issueInvoice}
            >
              <FileText className="mr-1 h-4 w-4" /> Create tax invoice
            </Button>
          )}
        </div>
        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <QuoteDocument data={data} />
        </div>
        <div className="no-print space-y-4 lg:col-start-1 lg:row-start-2 lg:space-y-3">
          <ActivityPanel target={{ quoteId: id }} phone={customer?.phone ?? null} />
          <QuoteHistory quoteId={id} />
        </div>
      </div>
    </PageShell>
  );
}
