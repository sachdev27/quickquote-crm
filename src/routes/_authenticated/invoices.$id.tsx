import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Printer } from "lucide-react";
import { PageShell } from "@/components/bottom-nav";
import { Card } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { QuoteDocument } from "@/components/quote-document";
import { getInvoice } from "@/data/api";
import { fmtDate } from "@/lib/quote-doc";
import { computeTotals, fmtMoney } from "@/lib/quote";

export const Route = createFileRoute("/_authenticated/invoices/$id")({
  head: () => ({ meta: [{ title: "Tax invoice — Tarko CRM" }] }),
  component: InvoicePage,
});

function InvoicePage() {
  const { id } = Route.useParams();
  const { data, error } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => getInvoice({ data: { id } }),
  });

  if (error)
    return (
      <PageShell title="Tax invoice">
        <p className="text-destructive">{(error as Error).message}</p>
      </PageShell>
    );
  if (!data)
    return (
      <PageShell title="Tax invoice">
        <div className="h-96 animate-pulse rounded-2xl bg-secondary" />
      </PageShell>
    );

  const { invoice: inv, brand, lines, quoteNo } = data;
  const total = computeTotals(lines, inv.extra_charges, {
    inclusive: false,
    igst: !!inv.igst,
  }).total;
  const doc = {
    quote: {
      quote_no: inv.invoice_no,
      quote_date: inv.invoice_date,
      igst: inv.igst,
      extra_charges: inv.extra_charges,
      terms: inv.terms,
      notes: inv.notes,
    },
    brand,
    customer: inv.buyer_name
      ? {
          name: inv.buyer_name,
          address: inv.buyer_address,
          phone: inv.buyer_phone,
          gstin: inv.buyer_gstin,
        }
      : null,
    lines,
  };

  return (
    <PageShell title={inv.invoice_no} wide>
      <div className="mx-auto grid max-w-md gap-4 md:max-w-5xl lg:max-w-none lg:grid-cols-[23rem_minmax(0,1fr)] lg:items-start lg:gap-3">
        <div className="no-print space-y-3 lg:space-y-2">
          <div className="flex gap-2 lg:gap-1.5">
            <Button
              className="h-12 flex-1 rounded-xl text-base font-semibold lg:text-sm"
              onClick={() => window.print()}
            >
              <Printer className="mr-2 h-5 w-5 lg:mr-1 lg:h-4 lg:w-4" /> Print / save PDF
            </Button>
            <Button asChild variant="outline" className="h-12 rounded-xl">
              <Link to="/quotes/$id" params={{ id: inv.quote_id }}>
                <FileText className="h-5 w-5 lg:h-4 lg:w-4" />
                <span className="hidden lg:inline">Quotation</span>
              </Link>
            </Button>
          </div>
          <Card title="Invoice">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Number</dt>
              <dd className="font-semibold">{inv.invoice_no}</dd>
              <dt className="text-muted-foreground">Date</dt>
              <dd>{fmtDate(inv.invoice_date)}</dd>
              <dt className="text-muted-foreground">Customer</dt>
              <dd>{inv.buyer_name ?? "Walk-in"}</dd>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-semibold tabular-nums">{fmtMoney(total)}</dd>
              {quoteNo && (
                <>
                  <dt className="text-muted-foreground">Quotation</dt>
                  <dd>{quoteNo}</dd>
                </>
              )}
              {inv.created_by && (
                <>
                  <dt className="text-muted-foreground">Issued by</dt>
                  <dd className="truncate">{inv.created_by}</dd>
                </>
              )}
            </dl>
            <p className="text-xs text-muted-foreground">
              This invoice is a snapshot taken when it was issued. Changing the quotation later does
              not change it.
            </p>
          </Card>
        </div>
        <div className="min-w-0">
          <QuoteDocument data={doc} invoice={{ quoteNo }} />
        </div>
      </div>
    </PageShell>
  );
}
