import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { UNIT_LABELS, computeTotals, fmtNum, inWords, lineWeight, type Line } from "@/lib/quote";
import { pipeSpec, type PipeSpec } from "@/lib/pipe-spec";
import { fmtAmt, fmtDate, stateOf, validUntil } from "@/lib/quote-doc";
import { PipeSection } from "@/components/pipe-section";
import type { getQuote } from "@/data/api";

type QuoteData = Awaited<ReturnType<typeof getQuote>>;

// A4 is 210 × 297 mm (ISO 216). At 96 css px per inch that is ~794 px wide.
const A4_PX = (210 / 25.4) * 96;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

// Shows the sheet at true A4 size, shrunk to fit narrower screens (like a PDF viewer). Print ignores the zoom.
function A4Frame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setZoom(Math.min(1, el.clientWidth / A4_PX));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="a4-frame w-full">
      <div style={{ zoom }} className="a4-zoom mx-auto w-fit">
        {children}
      </div>
    </div>
  );
}

// The printable proforma quotation, laid out as an A4 page. Particulars follow CGST Rule 46
// (supplier, number, date, recipient with GSTIN and state, HSN, qty, unit, value, rate and tax).
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
  const validTill = validUntil(q.quote_date, termList);
  const placeOfSupply = stateOf(customer?.gstin) ?? stateOf(brand?.gstin);
  const customerState = stateOf(customer?.gstin);
  const company = brand?.tagline?.replace(/^by\s+/i, "").trim() || "";
  const signFor = company || brand?.name;
  const hasPipes = specs.some(Boolean);

  return (
    <A4Frame>
      <article className="quote-doc print-sheet">
        {/* Print-only top/bottom spacer rows repeat on every printed page, so page margins stay inside
            the sheet (the @page margin is 0 to keep the browser's own date/URL header and footer off). */}
        <table className="qd-frame">
          <thead className="qd-pad">
            <tr>
              <td className="qd-pad-top" />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {/* 1. Letterhead */}
                <header className="flex items-start justify-between gap-6 border-b-[1.5pt] border-[var(--qd-accent)] pb-[3mm]">
                  <div className="flex gap-[3mm]">
                    {!brand?.logo && brand?.name && (
                      <div className="grid size-[12mm] shrink-0 place-items-center rounded-[1.5mm] bg-[var(--qd-accent)] text-[13pt] font-bold text-white">
                        {initials(brand.name)}
                      </div>
                    )}
                    <div>
                      {brand?.logo ? (
                        // The uploaded logo replaces the brand name + tagline; the company name goes under it.
                        <>
                          <img
                            src={brand.logo}
                            alt={brand.name}
                            className="max-h-[16mm] max-w-[70mm] object-contain object-left"
                          />
                          {company && (
                            <p className="mt-[1mm] text-[10pt] font-semibold leading-tight text-[var(--qd-ink)]">
                              {company}
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-[15pt] font-bold leading-tight text-[var(--qd-ink)]">
                            {brand?.name}
                          </p>
                          {brand?.tagline && (
                            <p className="text-[8.5pt] text-[var(--qd-muted)]">{brand.tagline}</p>
                          )}
                        </>
                      )}
                      <div className="mt-[1.5mm] text-[8pt] leading-snug text-[var(--qd-muted)]">
                        {brand?.address && <p className="whitespace-pre-line">{brand.address}</p>}
                        {brand?.phone && <p>Tel. {brand.phone}</p>}
                        {(brand?.gstin || brand?.pan) && (
                          <p className="text-[var(--qd-text)]">
                            {[
                              brand.gstin && `GSTIN ${brand.gstin}`,
                              brand.pan && `PAN ${brand.pan}`,
                            ]
                              .filter(Boolean)
                              .join("   |   ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <h1 className="text-[17pt] font-semibold uppercase leading-none tracking-[0.12em] text-[var(--qd-ink)]">
                      Quotation
                    </h1>
                    <p className="mt-[1.5mm] text-[7.5pt] font-medium uppercase tracking-wider text-[var(--qd-accent)]">
                      Proforma · not a tax invoice
                    </p>
                  </div>
                </header>

                {/* 2. Parties and quotation particulars */}
                <section className="mt-[3.5mm] grid grid-cols-[1fr_68mm] border border-[var(--qd-line)]">
                  <div className="p-[3mm]">
                    <Label>Bill to</Label>
                    <p className="mt-[1mm] text-[10pt] font-semibold text-[var(--qd-ink)]">
                      {customer?.name ?? "—"}
                    </p>
                    <div className="mt-[0.5mm] text-[8.5pt] leading-snug">
                      {customer?.address && (
                        <p className="whitespace-pre-line">{customer.address}</p>
                      )}
                      {customer?.phone && <p>Tel. {customer.phone}</p>}
                    </div>
                    {(customer?.gstin || customerState) && (
                      <dl className="mt-[1.5mm] grid grid-cols-[auto_1fr] gap-x-[3mm] text-[8.5pt]">
                        {customer?.gstin && <Field k="GSTIN" v={customer.gstin} />}
                        {customerState && <Field k="State" v={customerState} />}
                      </dl>
                    )}
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] content-start gap-x-[3mm] gap-y-[1mm] border-l border-[var(--qd-line)] bg-[var(--qd-soft)] p-[3mm] text-[8.5pt]">
                    <Field k="Quotation no." v={q.quote_no} strong />
                    <Field k="Date" v={fmtDate(q.quote_date)} />
                    {validTill && <Field k="Valid until" v={fmtDate(validTill)} />}
                    <Field
                      k="Supply"
                      v={igst ? "Inter-state (IGST)" : "Intra-state (CGST + SGST)"}
                    />
                    {placeOfSupply && <Field k="Place of supply" v={placeOfSupply} />}
                    <Field k="Currency" v="Indian Rupee (INR)" />
                  </dl>
                </section>

                {/* 3. Line items */}
                <table className="mt-[3.5mm] w-full border-collapse text-[8.5pt]">
                  <thead>
                    <tr className="bg-[var(--qd-accent)] text-left text-[7pt] uppercase tracking-wide text-white">
                      <Th className="w-[7mm] text-center">Sr.</Th>
                      <Th>Description of goods</Th>
                      <Th className="w-[16mm]">HSN</Th>
                      <Th className="w-[17mm] text-right">Qty</Th>
                      <Th className="w-[17mm] text-right">Rate (₹)</Th>
                      <Th className="w-[10mm] text-right">GST</Th>
                      <Th className="w-[25mm] text-right">Amount (₹)</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr
                        key={i}
                        className="break-inside-avoid border-b border-[var(--qd-line)] align-top"
                      >
                        <Td className="text-center text-[var(--qd-muted)]">{i + 1}</Td>
                        <Td>
                          <div className="flex items-center gap-[2.5mm]">
                            {specs[i] && <PipeSection spec={specs[i]!} />}
                            <div className="min-w-0">
                              <p className="font-medium text-[var(--qd-ink)]">{l.description}</p>
                              <SpecLine spec={specs[i]} line={l} />
                            </div>
                          </div>
                        </Td>
                        <Td className="whitespace-nowrap text-[8pt]">{l.hsn ?? "—"}</Td>
                        <Td className="whitespace-nowrap text-right">
                          {fmtNum(l.qty)} {UNIT_LABELS[l.unit]}
                        </Td>
                        <Td className="text-right">{fmtAmt(l.unitPrice)}</Td>
                        <Td className="text-right">{l.gstRate}%</Td>
                        <Td className="text-right font-medium text-[var(--qd-ink)]">
                          {fmtAmt(t.lines[i]!.taxable)}
                        </Td>
                      </tr>
                    ))}
                    {t.extra.taxable > 0 && (
                      <tr className="break-inside-avoid border-b border-[var(--qd-line)]">
                        <Td />
                        <Td className="font-medium text-[var(--qd-ink)]">Forwarding charges</Td>
                        <Td colSpan={4} />
                        <Td className="text-right font-medium text-[var(--qd-ink)]">
                          {fmtAmt(t.extra.taxable)}
                        </Td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* 4. Tax summary and totals */}
                <section className="mt-[3.5mm] grid break-inside-avoid grid-cols-[1fr_64mm] gap-[6mm]">
                  <div>
                    <Label>Tax summary (HSN-wise)</Label>
                    <table className="mt-[1.5mm] w-full border-collapse text-[7.5pt]">
                      <thead>
                        <tr className="border-y border-[var(--qd-line)] bg-[var(--qd-soft)] text-left text-[var(--qd-muted)]">
                          <th className="px-[1.5mm] py-[0.8mm] font-medium">HSN</th>
                          <th className="px-[1.5mm] py-[0.8mm] text-right font-medium">
                            Taxable (₹)
                          </th>
                          {igst ? (
                            <th className="px-[1.5mm] py-[0.8mm] text-right font-medium">
                              IGST (₹)
                            </th>
                          ) : (
                            <>
                              <th className="px-[1.5mm] py-[0.8mm] text-right font-medium">
                                CGST (₹)
                              </th>
                              <th className="px-[1.5mm] py-[0.8mm] text-right font-medium">
                                SGST (₹)
                              </th>
                            </>
                          )}
                          <th className="px-[1.5mm] py-[0.8mm] text-right font-medium">
                            Total tax (₹)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.groups.map((g) => (
                          <tr
                            key={`${g.hsn}${g.rate}`}
                            className="border-b border-[var(--qd-line)]"
                          >
                            <td className="px-[1.5mm] py-[0.8mm]">{g.hsn}</td>
                            <td className="px-[1.5mm] py-[0.8mm] text-right">
                              {fmtAmt(g.taxable)}
                            </td>
                            {igst ? (
                              <TaxCell rate={g.rate} amt={g.tax} />
                            ) : (
                              <>
                                <TaxCell rate={g.rate / 2} amt={g.tax / 2} />
                                <TaxCell rate={g.rate / 2} amt={g.tax / 2} />
                              </>
                            )}
                            <td className="px-[1.5mm] py-[0.8mm] text-right">{fmtAmt(g.tax)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-[3mm]">
                      <Label>Amount in words</Label>
                      <p className="mt-[0.5mm] text-[8.5pt] font-medium text-[var(--qd-ink)]">
                        Indian Rupees {inWords(t.total).replace(/ Rupees Only$/, "")} Only
                      </p>
                      <p className="mt-[1.5mm] text-[7.5pt] text-[var(--qd-muted)]">
                        {lines.length} {lines.length === 1 ? "item" : "items"}
                        {totalKg > 0 && ` · total weight ${fmtNum(totalKg)} kg`}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-[4mm]">
                    <div className="h-fit border border-[var(--qd-line)] text-[8.5pt]">
                      <div className="space-y-[1mm] p-[3mm]">
                        <Sum k="Taxable value" v={fmtAmt(t.taxable)} />
                        {igst ? (
                          <Sum k="IGST" v={fmtAmt(t.igst)} />
                        ) : (
                          <>
                            <Sum k="CGST" v={fmtAmt(t.cgst)} />
                            <Sum k="SGST" v={fmtAmt(t.sgst)} />
                          </>
                        )}
                        {t.roundOff !== 0 && <Sum k="Round off" v={fmtAmt(t.roundOff)} />}
                      </div>
                      <div className="flex items-baseline justify-between bg-[var(--qd-accent)] px-[3mm] py-[2mm] text-white">
                        <span className="text-[8pt] font-medium uppercase tracking-wide">
                          Total (₹)
                        </span>
                        <span className="text-[11pt] font-bold">{fmtAmt(t.total)}</span>
                      </div>
                    </div>
                    {(brand?.bank_account || brand?.upi_id) && (
                      <div>
                        <Label>Bank details</Label>
                        <dl className="mt-[1mm] grid grid-cols-[auto_1fr] gap-x-[3mm] gap-y-[0.5mm]">
                          {brand.bank_name && <Field k="Bank" v={brand.bank_name} />}
                          {brand.bank_account && <Field k="A/c no." v={brand.bank_account} />}
                          {brand.bank_ifsc && <Field k="IFSC" v={brand.bank_ifsc} />}
                          {brand.upi_id && <Field k="UPI" v={brand.upi_id} />}
                        </dl>
                      </div>
                    )}
                  </div>
                </section>

                {/* 5. Terms, customer acceptance and signature */}
                <section className="mt-[3.5mm] grid break-inside-avoid grid-cols-[1fr_44mm_50mm] gap-[6mm] border-t border-[var(--qd-line)] pt-[3mm] text-[8pt]">
                  <div>
                    {(termList.length > 0 || q.notes) && (
                      <>
                        <Label>Terms &amp; conditions</Label>
                        <ol className="mt-[1mm] list-decimal space-y-[0.3mm] pl-[4mm] marker:text-[var(--qd-muted)]">
                          {termList.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ol>
                        {q.notes && <p className="mt-[1.5mm] whitespace-pre-line">{q.notes}</p>}
                      </>
                    )}
                  </div>
                  <div className="flex flex-col justify-between">
                    <div>
                      <Label>Customer acceptance</Label>
                      <p className="mt-[0.5mm] text-[7.5pt] text-[var(--qd-muted)]">
                        We accept this quotation and its terms.
                      </p>
                    </div>
                    <p className="mt-[8mm] border-t border-[var(--qd-text)] pt-[1mm] text-[7.5pt] text-[var(--qd-muted)]">
                      Signature, stamp &amp; date
                    </p>
                  </div>
                  <div className="flex flex-col text-center">
                    <p className="font-semibold text-[var(--qd-ink)]">For {signFor}</p>
                    {/* company stamp with signature (transparent PNG, sits on the signing line) */}
                    <img
                      src="/sakhi-stamp.png"
                      alt="Company stamp and signature"
                      className="mx-auto mt-[0.5mm] -mb-[0.5mm] h-[16mm] w-auto object-contain"
                    />
                    <p className="border-t border-[var(--qd-text)] pt-[1mm] text-[7.5pt] text-[var(--qd-muted)]">
                      Authorised signatory
                    </p>
                  </div>
                </section>

                {/* 7. Notes on the document */}
                <footer className="mt-[3.5mm] break-inside-avoid border-t border-[var(--qd-line)] pt-[2mm] text-[7pt] leading-snug text-[var(--qd-muted)]">
                  <p className="flex justify-between gap-[4mm]">
                    <span>
                      Rates per unit, excluding GST.
                      {hasPipes &&
                        " OD = outside diameter, ID = inside diameter, Thickness = minimum wall, SDR = OD ÷ thickness (IS 4984); drawings not to scale."}{" "}
                      Computer-generated proforma, not a tax invoice; prices subject to confirmation
                      on order.
                    </span>
                    <span className="whitespace-nowrap">{q.quote_no}</span>
                  </p>
                </footer>
              </td>
            </tr>
          </tbody>
          <tfoot className="qd-pad">
            <tr>
              <td className="qd-pad-bottom" />
            </tr>
          </tfoot>
        </table>
      </article>
    </A4Frame>
  );
}

// Quiet lines under the description. OD / ID / thickness are written on the drawing itself.
function SpecLine({ spec, line: l }: { spec: PipeSpec | null | undefined; line: Line }) {
  const weight =
    l.weightKg > 0 &&
    `${fmtNum(l.weightKg, 3)} kg/${UNIT_LABELS[l.unit]} · ${fmtNum(lineWeight(l))} kg @ ₹${fmtAmt(l.rateKg)}/kg`;
  const sdr = spec?.sdr ? `SDR ${fmtNum(spec.sdr, 1)}` : "";
  if (!sdr && !weight) return null;
  return (
    <>
      {sdr && <p className="text-[7.5pt] text-[var(--qd-accent)]">{sdr}</p>}
      {weight && <p className="text-[7.5pt] text-[var(--qd-muted)]">{weight}</p>}
    </>
  );
}

const Th = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <th className={`px-[1.5mm] py-[1.8mm] font-semibold ${className}`}>{children}</th>
);

const Td = ({
  children,
  className = "",
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) => (
  <td colSpan={colSpan} className={`px-[1.5mm] py-[1.1mm] ${className}`}>
    {children}
  </td>
);

const TaxCell = ({ rate, amt }: { rate: number; amt: number }) => (
  <td className="px-[1.5mm] py-[0.8mm] text-right">
    <span className="text-[var(--qd-muted)]">{rate}% </span>
    {fmtAmt(amt)}
  </td>
);

const Label = ({ children }: { children: ReactNode }) => (
  <p className="text-[7pt] font-semibold uppercase tracking-wider text-[var(--qd-accent)]">
    {children}
  </p>
);

const Field = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
  <>
    <dt className="text-[var(--qd-muted)]">{k}</dt>
    <dd className={strong ? "font-semibold text-[var(--qd-ink)]" : ""}>{v}</dd>
  </>
);

const Sum = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between">
    <span className="text-[var(--qd-muted)]">{k}</span>
    <span>{v}</span>
  </div>
);
