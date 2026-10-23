import type { ReactNode } from "react";
import { UNIT_LABELS, computeTotals, fmtMoney, fmtNum, inWords, lineWeight } from "@/lib/quote";
import { pipeSpec, type PipeSpec } from "@/lib/pipe-spec";
import { PipeSection } from "@/components/pipe-section";
import type { getQuote } from "@/data/api";

type QuoteData = Awaited<ReturnType<typeof getQuote>>;

// "2026-10-23" -> "23 Oct 2026"; anything else prints as stored.
const fmtDate = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

// The printable proforma: letterhead, items with pipe cross-sections, HSN-wise GST, totals.
// Always paper-white (also in dark mode), like a PDF. Shared by the quote page and the desktop preview.
export function QuoteDocument({ data }: { data: QuoteData }) {
  const { quote: q, brand, customer, lines } = data;
  const igst = !!q.igst;
  // Quotes save the terms they were sent with; older quotes fall back to the brand's terms text.
  const termList = (q.terms ?? brand?.terms ?? "")
    .split(/\n|(?<=\.)\s+(?=[A-Z])/)
    .map((x) => x.trim())
    .filter(Boolean);
  const t = computeTotals(lines, q.extra_charges, { inclusive: false, igst });
  const specs = lines.map(pipeSpec);
  const totalKg = lines.reduce((s, l) => s + (l.weightKg > 0 ? lineWeight(l) : 0), 0);
  const signFor = brand?.tagline?.replace(/^by\s+/i, "") || brand?.name;

  return (
    <article className="quote-doc @container print-sheet overflow-hidden rounded-xl bg-white text-[13px] leading-normal text-slate-800 shadow-sm ring-1 ring-slate-200">
      <div className="h-1.5 bg-[var(--qd-accent)] print:mb-6" />
      <div className="p-5 @2xl:p-10 print:p-0">
        {/* Letterhead */}
        <header className="flex flex-col gap-6 @2xl:flex-row @2xl:items-start @2xl:justify-between">
          <div className="flex gap-3.5">
            {brand?.name && (
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[var(--qd-accent)] font-display text-lg font-bold text-white">
                {initials(brand.name)}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-display text-xl font-bold leading-tight text-slate-900">
                {brand?.name}
              </p>
              {brand?.tagline && <p className="text-slate-500">{brand.tagline}</p>}
              <div className="mt-2 space-y-0.5 text-xs text-slate-500">
                {brand?.address && <p className="whitespace-pre-line">{brand.address}</p>}
                {brand?.phone && <p>{brand.phone}</p>}
                {(brand?.gstin || brand?.pan) && (
                  <p className="font-medium text-slate-600">
                    {[brand.gstin && `GSTIN ${brand.gstin}`, brand.pan && `PAN ${brand.pan}`]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="@2xl:text-right">
            <p className="font-display text-3xl font-light uppercase tracking-[0.18em] text-slate-900">
              Quotation
            </p>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--qd-accent)]">
              Proforma · Not a tax invoice
            </p>
            <dl className="mt-4 grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-xs @2xl:justify-end">
              <Meta k="Quotation no." v={q.quote_no} strong />
              <Meta k="Date" v={fmtDate(q.quote_date)} />
              <Meta k="Supply" v={igst ? "Inter-state · IGST" : "Intra-state · CGST + SGST"} />
              <Meta k="Currency" v="INR (₹)" />
            </dl>
          </div>
        </header>

        {/* Parties + summary */}
        <section className="mt-8 grid gap-4 @2xl:grid-cols-[1fr_17rem]">
          <div className="rounded-lg border border-slate-200 p-4">
            <Label>Bill to</Label>
            <p className="mt-1.5 text-[15px] font-semibold text-slate-900">
              {customer?.name ?? "—"}
            </p>
            <div className="mt-1 space-y-0.5 text-xs text-slate-500">
              {customer?.address && <p className="whitespace-pre-line">{customer.address}</p>}
              {customer?.phone && <p>{customer.phone}</p>}
              {customer?.gstin && (
                <p className="font-medium text-slate-600">GSTIN {customer.gstin}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-lg bg-[var(--qd-accent-soft)] p-4">
            <div>
              <Label>Quotation total</Label>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">
                {fmtMoney(t.total)}
              </p>
              <p className="text-[11px] text-slate-500">Inclusive of GST</p>
            </div>
            <div className="mt-3 flex gap-5 border-t border-slate-900/10 pt-2.5 text-xs tabular-nums text-slate-600">
              <span>
                <b className="font-semibold text-slate-900">{lines.length}</b>{" "}
                {lines.length === 1 ? "item" : "items"}
              </span>
              {totalKg > 0 && (
                <span>
                  <b className="font-semibold text-slate-900">{fmtNum(totalKg)}</b> kg total
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Items: stacked on phones, table on desktop/print */}
        <ul className="mt-6 divide-y divide-slate-200 border-y border-slate-200 tabular-nums @2xl:hidden print:hidden">
          {lines.map((l, i) => (
            <li key={i} className="flex gap-3 py-3.5">
              {specs[i] && <PipeSection spec={specs[i]!} size={44} />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug text-slate-900">
                  <span className="mr-1.5 text-slate-400">{i + 1}.</span>
                  {l.description}
                </p>
                <SpecLine spec={specs[i]} />
                <p className="mt-1.5 flex justify-between gap-3 text-xs text-slate-500">
                  <span>
                    {fmtNum(l.qty)} {UNIT_LABELS[l.unit]} × {fmtMoney(l.unitPrice)} · GST{" "}
                    {l.gstRate}%
                  </span>
                  <span className="text-[13px] font-semibold text-slate-900">
                    {fmtMoney(t.lines[i]!.taxable)}
                  </span>
                </p>
                <WeightLine l={l} />
              </div>
            </li>
          ))}
          {t.extra.taxable > 0 && (
            <li className="flex justify-between py-3 font-medium">
              <span>Forwarding charges</span>
              <span className="font-semibold">{fmtMoney(t.extra.taxable)}</span>
            </li>
          )}
        </ul>
        <table className="mt-8 hidden w-full border-collapse tabular-nums @2xl:table print:table">
          <thead>
            <tr className="border-y border-slate-300 bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="w-8 py-2.5 pl-3 font-semibold">#</th>
              <th className="py-2.5 font-semibold">Item &amp; specification</th>
              <th className="px-2 py-2.5 font-semibold">HSN</th>
              <th className="px-2 py-2.5 text-right font-semibold">Qty</th>
              <th className="px-2 py-2.5 text-right font-semibold">Rate</th>
              <th className="px-2 py-2.5 text-right font-semibold">GST</th>
              <th className="py-2.5 pr-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="break-inside-avoid border-b border-slate-200 align-top">
                <td className="py-3.5 pl-3 text-slate-400">{i + 1}</td>
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-3">
                    {specs[i] && <PipeSection spec={specs[i]!} />}
                    <div className="min-w-0">
                      <p className="font-semibold leading-snug text-slate-900">{l.description}</p>
                      <SpecLine spec={specs[i]} />
                      <WeightLine l={l} />
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-2 py-3.5 text-xs text-slate-500">
                  {l.hsn ?? "—"}
                </td>
                <td className="whitespace-nowrap px-2 py-3.5 text-right">
                  {fmtNum(l.qty)} <span className="text-slate-500">{UNIT_LABELS[l.unit]}</span>
                </td>
                <td className="whitespace-nowrap px-2 py-3.5 text-right">
                  {fmtMoney(l.unitPrice)}
                  <span className="text-slate-500">/{UNIT_LABELS[l.unit]}</span>
                </td>
                <td className="px-2 py-3.5 text-right text-slate-500">{l.gstRate}%</td>
                <td className="whitespace-nowrap py-3.5 pr-3 text-right font-semibold text-slate-900">
                  {fmtMoney(t.lines[i]!.taxable)}
                </td>
              </tr>
            ))}
            {t.extra.taxable > 0 && (
              <tr className="border-b border-slate-200">
                <td />
                <td className="py-3 font-medium text-slate-900">Forwarding charges</td>
                <td colSpan={4} />
                <td className="py-3 pr-3 text-right font-semibold text-slate-900">
                  {fmtMoney(t.extra.taxable)}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Tax summary + totals */}
        <section className="mt-6 grid break-inside-avoid gap-6 @2xl:grid-cols-[1fr_19rem] print:grid-cols-[1fr_19rem]">
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <Label>Tax summary</Label>
              <table className="mt-2 w-full text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[10.5px] uppercase tracking-wider text-slate-500">
                    <th className="py-1.5 font-semibold">HSN / SAC</th>
                    <th className="py-1.5 text-right font-semibold">Taxable</th>
                    {igst ? (
                      <th className="py-1.5 text-right font-semibold">IGST</th>
                    ) : (
                      <>
                        <th className="py-1.5 text-right font-semibold">CGST</th>
                        <th className="py-1.5 text-right font-semibold">SGST</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {t.groups.map((g) => (
                    <tr key={`${g.hsn}${g.rate}`} className="border-b border-slate-100">
                      <td className="py-1.5 text-slate-600">{g.hsn}</td>
                      <td className="py-1.5 text-right">{fmtMoney(g.taxable)}</td>
                      {igst ? (
                        <td className="py-1.5 text-right">
                          <span className="text-slate-400">{g.rate}%</span> {fmtMoney(g.tax)}
                        </td>
                      ) : (
                        <>
                          <td className="py-1.5 text-right">
                            <span className="text-slate-400">{g.rate / 2}%</span>{" "}
                            {fmtMoney(g.tax / 2)}
                          </td>
                          <td className="py-1.5 text-right">
                            <span className="text-slate-400">{g.rate / 2}%</span>{" "}
                            {fmtMoney(g.tax / 2)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <Label>Amount in words</Label>
              <p className="mt-1 font-semibold text-slate-900">{inWords(t.total)}</p>
            </div>
          </div>

          <div className="h-fit overflow-hidden rounded-lg border border-slate-200 tabular-nums">
            <div className="space-y-2 p-4">
              <Row k="Sub-total (taxable)" v={fmtMoney(t.taxable)} />
              {igst ? (
                <Row k="IGST" v={fmtMoney(t.igst)} />
              ) : (
                <>
                  <Row k="CGST" v={fmtMoney(t.cgst)} />
                  <Row k="SGST" v={fmtMoney(t.sgst)} />
                </>
              )}
              {t.roundOff !== 0 && <Row k="Round off" v={fmtMoney(t.roundOff)} />}
            </div>
            <div className="flex items-baseline justify-between bg-[var(--qd-accent)] px-4 py-3 text-white">
              <span className="text-xs font-semibold uppercase tracking-wider">Grand total</span>
              <span className="font-display text-xl font-bold">{fmtMoney(t.total)}</span>
            </div>
          </div>
        </section>

        {/* Terms, bank, signature */}
        <footer className="mt-8 grid break-inside-avoid gap-6 border-t border-slate-200 pt-6 text-xs @2xl:grid-cols-[1fr_15rem] print:grid-cols-[1fr_15rem]">
          <div className="space-y-5">
            {(termList.length > 0 || q.notes) && (
              <div>
                <Label>Terms &amp; conditions</Label>
                <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-slate-600 marker:text-slate-400">
                  {termList.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ol>
                {q.notes && <p className="mt-2 whitespace-pre-line text-slate-600">{q.notes}</p>}
              </div>
            )}
            {(brand?.bank_account || brand?.upi_id) && (
              <div>
                <Label>Payment details</Label>
                <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-slate-600">
                  {brand.bank_name && <Meta k="Bank" v={brand.bank_name} />}
                  {brand.bank_account && <Meta k="Account no." v={brand.bank_account} />}
                  {brand.bank_ifsc && <Meta k="IFSC" v={brand.bank_ifsc} />}
                  {brand.upi_id && <Meta k="UPI" v={brand.upi_id} />}
                </dl>
              </div>
            )}
          </div>
          <div className="flex flex-col justify-end text-center @2xl:items-stretch">
            <p className="font-semibold text-slate-900">For {signFor}</p>
            <div className="h-16" />
            <p className="border-t border-slate-300 pt-1.5 text-slate-500">Authorised signatory</p>
          </div>
        </footer>

        <p className="mt-8 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3 text-[10.5px] text-slate-400">
          <span>
            Computer-generated quotation · {q.quote_no}. Prices subject to final confirmation.
          </span>
          {brand?.name && <span>{brand.name}</span>}
        </p>
      </div>
    </article>
  );
}

function SpecLine({ spec }: { spec: PipeSpec | null | undefined }) {
  if (!spec) return null;
  const parts: ReactNode[] = [
    <Spec key="od" k="OD" v={`${fmtNum(spec.od)} mm`} />,
    spec.wall && <Spec key="e" k="Wall" v={`${fmtNum(spec.wall, 1)} mm`} />,
    spec.sdr && <Spec key="sdr" k="SDR" v={fmtNum(spec.sdr, 1)} />,
  ].filter(Boolean);
  return <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">{parts}</p>;
}

function WeightLine({ l }: { l: QuoteData["lines"][number] }) {
  if (!(l.weightKg > 0)) return null;
  return (
    <p className="mt-0.5 text-[11px] tabular-nums text-slate-400">
      {fmtNum(l.weightKg, 3)} kg/{UNIT_LABELS[l.unit]} · {fmtNum(lineWeight(l))} kg @{" "}
      {fmtMoney(l.rateKg)}/kg
    </p>
  );
}

const Spec = ({ k, v }: { k: string; v: string }) => (
  <span className="whitespace-nowrap">
    <span className="text-slate-400">{k}</span>{" "}
    <span className="font-medium text-[var(--qd-accent)]">{v}</span>
  </span>
);

const Label = ({ children }: { children: ReactNode }) => (
  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{children}</p>
);

const Meta = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
  <>
    <dt className="text-slate-500">{k}</dt>
    <dd className={strong ? "font-semibold text-slate-900" : "text-slate-800"}>{v}</dd>
  </>
);

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between">
    <span className="text-slate-500">{k}</span>
    <span className="text-slate-900">{v}</span>
  </div>
);
