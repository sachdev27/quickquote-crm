import { UNIT_LABELS, computeTotals, fmtMoney, fmtNum, inWords, lineWeight } from "@/lib/quote";
import type { getQuote } from "@/data/api";

type QuoteData = Awaited<ReturnType<typeof getQuote>>;

// The printable proforma (letterhead, lines, HSN-wise GST, totals). Shared by the quote page and the desktop preview.
export function QuoteDocument({ data }: { data: QuoteData }) {
  const { quote: q, brand, customer, lines } = data;
  const igst = !!q.igst;
  const t = computeTotals(lines, q.extra_charges, { inclusive: false, igst });
  return (
    <article className="@container print-sheet rounded-2xl border border-border bg-card p-5 text-sm @2xl:p-8">
      {/* Letterhead */}
      <header className="flex flex-col gap-3 border-b border-border pb-4 @md:flex-row @md:justify-between">
        <div>
          <p className="text-2xl font-bold leading-tight">{brand?.name}</p>
          {brand?.tagline && <p className="text-muted-foreground">{brand.tagline}</p>}
          {brand?.address && (
            <p className="mt-1 whitespace-pre-line text-muted-foreground">{brand.address}</p>
          )}
          {brand?.phone && <p className="text-muted-foreground">{brand.phone}</p>}
          <p className="text-muted-foreground">
            {[brand?.gstin && `GSTIN ${brand.gstin}`, brand?.pan && `PAN ${brand.pan}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="@md:text-right">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Proforma Quotation
          </p>
          <p className="font-semibold">{q.quote_no}</p>
          <p className="text-muted-foreground">{q.quote_date}</p>
        </div>
      </header>

      <section className="border-b border-border py-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Billed to</p>
        <p className="font-semibold">{customer?.name ?? "—"}</p>
        {customer?.address && (
          <p className="whitespace-pre-line text-muted-foreground">{customer.address}</p>
        )}
        {customer?.phone && <p className="text-muted-foreground">{customer.phone}</p>}
        {customer?.gstin && <p className="text-muted-foreground">GSTIN {customer.gstin}</p>}
      </section>

      {/* Items: stacked on phones, table on desktop/print */}
      <ul className="divide-y divide-border/60 tabular-nums @2xl:hidden print:hidden">
        {lines.map((l, i) => (
          <li key={i} className="py-3">
            <p className="font-medium leading-snug">
              {i + 1}. {l.description}
            </p>
            <p className="mt-1 flex justify-between text-muted-foreground">
              <span>
                {fmtNum(l.qty)} {UNIT_LABELS[l.unit]} × {fmtMoney(l.unitPrice)} · GST {l.gstRate}%
              </span>
              <span className="font-semibold text-foreground">{fmtMoney(t.lines[i]!.taxable)}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {[
                l.hsn && `HSN ${l.hsn}`,
                l.weightKg > 0 && `${fmtNum(lineWeight(l))} kg @ ${fmtMoney(l.rateKg)}/kg`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </li>
        ))}
      </ul>
      <table className="mt-2 hidden w-full tabular-nums @2xl:table print:table">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-2">#</th>
            <th>Item</th>
            <th>HSN</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Kg</th>
            <th className="text-right">₹/kg</th>
            <th className="text-right">Rate</th>
            <th className="text-right">GST</th>
            <th className="text-right">Taxable</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-border/50 align-top">
              <td className="py-2.5 pr-2 text-muted-foreground">{i + 1}</td>
              <td className="pr-3 font-medium">{l.description}</td>
              <td className="pr-2 text-muted-foreground">{l.hsn ?? "—"}</td>
              <td className="text-right">
                {fmtNum(l.qty)} {UNIT_LABELS[l.unit]}
              </td>
              <td className="text-right">{l.weightKg > 0 ? fmtNum(lineWeight(l)) : "—"}</td>
              <td className="text-right">{l.weightKg > 0 ? fmtNum(l.rateKg) : "—"}</td>
              <td className="text-right">
                {fmtNum(l.unitPrice)}/{UNIT_LABELS[l.unit]}
              </td>
              <td className="text-right">{l.gstRate}%</td>
              <td className="text-right font-semibold">{fmtMoney(t.lines[i]!.taxable)}</td>
            </tr>
          ))}
          {t.extra.taxable > 0 && (
            <tr className="border-b border-border/50">
              <td />
              <td className="py-2.5 font-medium">Forwarding charges</td>
              <td />
              <td />
              <td />
              <td />
              <td />
              <td />
              <td className="text-right font-semibold">{fmtMoney(t.extra.taxable)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-4 grid gap-5 @2xl:grid-cols-[1fr_18rem]">
        {/* GST summary by HSN & rate */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="border-b border-border text-left uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5">HSN</th>
                <th className="text-right">Taxable</th>
                {igst ? (
                  <th className="text-right">IGST</th>
                ) : (
                  <>
                    <th className="text-right">CGST</th>
                    <th className="text-right">SGST</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {t.groups.map((g) => (
                <tr key={`${g.hsn}${g.rate}`} className="border-b border-border/50">
                  <td className="py-1.5">{g.hsn}</td>
                  <td className="text-right">{fmtMoney(g.taxable)}</td>
                  {igst ? (
                    <td className="text-right">
                      {g.rate}% · {fmtMoney(g.tax)}
                    </td>
                  ) : (
                    <>
                      <td className="text-right">
                        {g.rate / 2}% · {fmtMoney(g.tax / 2)}
                      </td>
                      <td className="text-right">
                        {g.rate / 2}% · {fmtMoney(g.tax / 2)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-1.5 tabular-nums">
          <Row k="Taxable value" v={fmtMoney(t.taxable)} />
          {igst ? (
            <Row k="IGST" v={fmtMoney(t.igst)} />
          ) : (
            <>
              <Row k="CGST" v={fmtMoney(t.cgst)} />
              <Row k="SGST" v={fmtMoney(t.sgst)} />
            </>
          )}
          {t.roundOff !== 0 && <Row k="Round off" v={fmtMoney(t.roundOff)} />}
          <div className="flex items-baseline justify-between border-t border-border pt-2">
            <span className="font-semibold">Total (INR)</span>
            <span className="text-xl font-bold">{fmtMoney(t.total)}</span>
          </div>
        </div>
      </div>
      <p className="mt-3 border-y border-border py-2 text-xs">
        <span className="text-muted-foreground">Amount in words: </span>
        <span className="font-semibold">{inWords(t.total)}</span>
      </p>

      <footer className="mt-4 grid gap-5 text-xs @md:grid-cols-2">
        <div className="space-y-3">
          {(brand?.terms || q.notes) && (
            <div>
              <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                Terms
              </p>
              {brand?.terms && <p className="whitespace-pre-line">{brand.terms}</p>}
              {q.notes && <p className="mt-1 whitespace-pre-line">{q.notes}</p>}
            </div>
          )}
          {(brand?.bank_account || brand?.upi_id) && (
            <div>
              <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                Bank & UPI
              </p>
              {brand.bank_name && <p>{brand.bank_name}</p>}
              {brand.bank_account && (
                <p>
                  A/c {brand.bank_account}
                  {brand.bank_ifsc ? ` · IFSC ${brand.bank_ifsc}` : ""}
                </p>
              )}
              {brand.upi_id && <p>UPI {brand.upi_id}</p>}
            </div>
          )}
        </div>
        <div className="flex flex-col justify-end @md:items-end">
          <p className="font-semibold">
            For {brand?.tagline?.replace(/^by\s+/i, "") || brand?.name}
          </p>
          <div className="h-12" />
          <p className="text-muted-foreground">Authorised signatory</p>
        </div>
      </footer>
      <p className="mt-6 text-center text-[11px] text-muted-foreground">
        Proforma quotation, not a tax invoice. Prices subject to final confirmation.
      </p>
    </article>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between">
    <span className="text-muted-foreground">{k}</span>
    <span>{v}</span>
  </div>
);
