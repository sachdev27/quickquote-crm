export type Category = "pipe" | "sprinkler" | "fitting";
export type Unit = "m" | "pc" | "kg";

export const CATEGORY_LABELS: Record<Category, string> = { pipe: "HDPE Pipe", sprinkler: "Sprinkler", fitting: "Fitting" };
export const UNIT_LABELS: Record<Unit, string> = { m: "m", pc: "pcs", kg: "kg" };
export const GST_OPTIONS = [0, 5, 12, 18, 28];
export interface Brand {
  id: string;
  code: string;
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  gstin: string | null;
  pan: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_ifsc: string | null;
  upi_id: string | null;
  terms: string | null;
}

export const STATUS_LABELS: Record<string, string> = { draft: "Draft", sent: "Sent", won: "Won", lost: "Lost" };

// One quote line. unitPrice is in the quote's basis: GST-inclusive or exclusive (see Totals).
export interface Line {
  productId: string | null;
  category: Category;
  description: string;
  hsn: string | null;
  unit: Unit;
  qty: number;
  unitPrice: number;
  gstRate: number;
}

export interface TaxGroup {
  hsn: string;
  rate: number;
  taxable: number;
  tax: number;
}

export interface Totals {
  lines: { taxable: number; tax: number; gross: number }[];
  extra: { taxable: number; tax: number };
  groups: TaxGroup[];
  taxable: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  total: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const lineGross = (l: Pick<Line, "qty" | "unitPrice">) => l.qty * l.unitPrice;

// Extra (forwarding) charges are taxed at the highest line rate, as a composite supply follows the principal item.
export function computeTotals(
  lines: Pick<Line, "qty" | "unitPrice" | "gstRate" | "hsn">[],
  extraCharges: number,
  opts: { inclusive: boolean; igst: boolean }
): Totals {
  const split = (gross: number, rate: number) => {
    const taxable = opts.inclusive ? gross / (1 + rate / 100) : gross;
    return { taxable, tax: taxable * (rate / 100), gross: opts.inclusive ? gross : taxable * (1 + rate / 100) };
  };
  const perLine = lines.map((l) => split(lineGross(l), l.gstRate));
  const extraRate = Math.max(0, ...lines.map((l) => l.gstRate));
  const extra = split(extraCharges, extraRate);

  const groups = new Map<string, TaxGroup>();
  const addGroup = (hsn: string, rate: number, taxable: number, tax: number) => {
    const k = `${hsn}|${rate}`;
    const g = groups.get(k) ?? { hsn, rate, taxable: 0, tax: 0 };
    g.taxable += taxable;
    g.tax += tax;
    groups.set(k, g);
  };
  lines.forEach((l, i) => addGroup(l.hsn || "—", l.gstRate, perLine[i]!.taxable, perLine[i]!.tax));
  if (extraCharges > 0) addGroup("Freight", extraRate, extra.taxable, extra.tax);

  const taxable = r2(perLine.reduce((s, x) => s + x.taxable, 0) + extra.taxable);
  const tax = r2(perLine.reduce((s, x) => s + x.tax, 0) + extra.tax);
  const exact = taxable + tax;
  const total = Math.round(exact);
  const half = r2(tax / 2);
  return {
    lines: perLine,
    extra: { taxable: extra.taxable, tax: extra.tax },
    groups: [...groups.values()],
    taxable,
    tax,
    cgst: opts.igst ? 0 : half,
    sgst: opts.igst ? 0 : r2(tax - half),
    igst: opts.igst ? tax : 0,
    roundOff: r2(total - exact),
    total,
  };
}

export const fmtMoney = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: n % 1 ? 2 : 0 });
export const fmtNum = (n: number, digits = 2) => n.toLocaleString("en-IN", { maximumFractionDigits: digits });

export function nextQuoteNo(code: string, count: number, date = new Date()): string {
  const ym = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}`;
  return `${code}-${ym}-${String(count + 1).padStart(3, "0")}`;
}

// Indian numbering: 3,67,462 -> "Three Lakh Sixty Seven Thousand Four Hundred Sixty Two Rupees Only"
const ONES = "Zero One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen Fifteen Sixteen Seventeen Eighteen Nineteen".split(" ");
const TENS = "  Twenty Thirty Forty Fifty Sixty Seventy Eighty Ninety".split(" ");
function below1000(n: number): string {
  const h = Math.floor(n / 100), rest = n % 100;
  const t = rest < 20 ? (rest ? ONES[rest] : "") : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? " " + ONES[rest % 10] : ""}`;
  return [h ? `${ONES[h]} Hundred` : "", t].filter(Boolean).join(" ");
}
export function inWords(amount: number): string {
  let n = Math.round(amount);
  if (n === 0) return "Zero Rupees Only";
  const parts: string[] = [];
  for (const [div, name] of [[1e7, "Crore"], [1e5, "Lakh"], [1e3, "Thousand"]] as const) {
    const q = Math.floor(n / div);
    if (q) parts.push(`${q >= 1000 ? inWords(q).replace(" Rupees Only", "") : below1000(q)} ${name}`);
    n %= div;
  }
  if (n) parts.push(below1000(n));
  return `${parts.join(" ")} Rupees Only`;
}

export function buildWhatsAppUrl(opts: {
  quoteNo: string;
  quoteDate: string;
  customerName: string | null;
  customerPhone: string | null;
  companyName: string | null;
  inclusive: boolean;
  lines: Line[];
  totals: Totals;
  notes: string | null;
}): string {
  const out = ["*PROFORMA QUOTATION*", `${opts.quoteNo} · ${opts.quoteDate}`];
  if (opts.customerName) out.push(`To: ${opts.customerName}`);
  out.push("");
  opts.lines.forEach((l, i) =>
    out.push(`${i + 1}. ${l.description}\n    ${fmtNum(l.qty)} ${UNIT_LABELS[l.unit]} × ${fmtMoney(l.unitPrice)} = ${fmtMoney(lineGross(l))}`)
  );
  out.push("", `Taxable: ${fmtMoney(opts.totals.taxable)}`, `GST: ${fmtMoney(opts.totals.tax)}`);
  if (opts.totals.roundOff) out.push(`Round off: ${fmtMoney(opts.totals.roundOff)}`);
  out.push(`*Total: ${fmtMoney(opts.totals.total)}*`, opts.inclusive ? "(rates include GST)" : "(GST extra on rates)");
  if (opts.notes) out.push("", opts.notes);
  if (opts.companyName) out.push("", opts.companyName);
  const d = (opts.customerPhone ?? "").replace(/\D/g, "");
  return `https://wa.me/${d.length === 10 ? "91" + d : d}?text=${encodeURIComponent(out.join("\n"))}`;
}
