export type Category = "pipe" | "sprinkler" | "fitting";
export type Unit = "m" | "pc" | "kg";

export const CATEGORY_LABELS: Record<Category, string> = {
  pipe: "HDPE Pipe",
  sprinkler: "Sprinkler",
  fitting: "Fitting",
};
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
  default_preset_id: string | null;
  logo: string | null;
}

// Pipeline stages (deal flow). "negotiation" lives in quotes.stage; quotes.status mirrors it as "sent".
export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};
export const STAGES = ["draft", "sent", "negotiation", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];

// ₹/kg = raw + production + transport + margin (margin as % of that cost, or flat ₹/kg). GST goes on top.
export interface Rate {
  raw_kg: number;
  raw_kg_non_isi?: number | null; // used instead of raw_kg on Non-ISI quotes, when set
  production_kg: number;
  transport_kg: number;
  margin: number;
  margin_is_pct: number;
}
export const costPerKg = (r: Pick<Rate, "raw_kg" | "production_kg" | "transport_kg">) =>
  r.raw_kg + r.production_kg + r.transport_kg;
// A brand's own raw price (per grade) replaces the preset's raw; anything it leaves blank falls back.
export function withBrandRaw<T extends Rate>(
  r: T,
  b?: { raw_kg: number; raw_kg_non_isi: number | null } | null,
): T {
  return b
    ? { ...r, raw_kg: b.raw_kg, raw_kg_non_isi: b.raw_kg_non_isi ?? r.raw_kg_non_isi ?? null }
    : r;
}

export function ratePerKg(r: Rate, nonIsi = false): number {
  const raw = nonIsi && r.raw_kg_non_isi != null ? r.raw_kg_non_isi : r.raw_kg;
  const cost = raw + r.production_kg + r.transport_kg;
  return r.margin_is_pct ? cost * (1 + r.margin / 100) : cost + r.margin;
}

// Sprinkler pipe is priced per piece: raw ₹/kg × the brand's piece weight + production ₹ + margin ₹ (both flat
// per piece, stored in production_kg and margin of the SPRINKLER rate). Returned as the equivalent ₹/kg
// so a line stays weight × rate.
export const SPRINKLER_GROUP = "SPRINKLER";
export function sprinklerPrice(r: Rate, weightKg: number, nonIsi = false): number {
  const raw = nonIsi && r.raw_kg_non_isi != null ? r.raw_kg_non_isi : r.raw_kg;
  return raw * weightKg + r.production_kg + r.margin;
}
export const sprinklerRateKg = (r: Rate, weightKg: number, nonIsi = false) =>
  weightKg > 0 ? sprinklerPrice(r, weightKg, nonIsi) / weightKg : 0;

// ₹/kg a product of this rate group sells at, given its weight.
export const rateKgFor = (r: Rate, group: string, weightKg: number, nonIsi = false) =>
  group === SPRINKLER_GROUP ? sprinklerRateKg(r, weightKg, nonIsi) : ratePerKg(r, nonIsi);

// One quote line, ex-GST. unitPrice = weightKg × rateKg (per metre / piece); custom lines may type unitPrice directly.
export interface Line {
  productId: string | null;
  rateGroupId: string | null;
  category: Category;
  description: string;
  // catalog pipes/sprinklers: the brand whose raw price and name apply to this line (client-side only)
  brandId?: string;
  hsn: string | null;
  unit: Unit;
  qty: number;
  weightKg: number;
  rateKg: number;
  unitPrice: number;
  gstRate: number;
}
export const lineWeight = (l: Pick<Line, "qty" | "weightKg">) => l.qty * l.weightKg;

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
  opts: { inclusive: boolean; igst: boolean },
): Totals {
  const split = (gross: number, rate: number) => {
    const taxable = opts.inclusive ? gross / (1 + rate / 100) : gross;
    return {
      taxable,
      tax: taxable * (rate / 100),
      gross: opts.inclusive ? gross : taxable * (1 + rate / 100),
    };
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
  (n < 0 ? "−₹" : "₹") +
  Math.abs(n).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: n % 1 ? 2 : 0,
  });
export const fmtNum = (n: number, digits = 2) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: digits });

export function nextQuoteNo(code: string, count: number, date = new Date()): string {
  const ym = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}`;
  return `${code}-${ym}-${String(count + 1).padStart(3, "0")}`;
}

// Indian numbering: 3,67,462 -> "Three Lakh Sixty Seven Thousand Four Hundred Sixty Two Rupees Only"
const ONES =
  "Zero One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen Fifteen Sixteen Seventeen Eighteen Nineteen".split(
    " ",
  );
const TENS = "  Twenty Thirty Forty Fifty Sixty Seventy Eighty Ninety".split(" ");
function below1000(n: number): string {
  const h = Math.floor(n / 100),
    rest = n % 100;
  const t =
    rest < 20
      ? rest
        ? ONES[rest]
        : ""
      : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? " " + ONES[rest % 10] : ""}`;
  return [h ? `${ONES[h]} Hundred` : "", t].filter(Boolean).join(" ");
}
export function inWords(amount: number): string {
  let n = Math.round(amount);
  if (n === 0) return "Zero Rupees Only";
  const parts: string[] = [];
  for (const [div, name] of [
    [1e7, "Crore"],
    [1e5, "Lakh"],
    [1e3, "Thousand"],
  ] as const) {
    const q = Math.floor(n / div);
    if (q)
      parts.push(`${q >= 1000 ? inWords(q).replace(" Rupees Only", "") : below1000(q)} ${name}`);
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
  lines: Line[];
  totals: Totals;
  notes: string | null;
}): string {
  const out = ["*PROFORMA QUOTATION*", `${opts.quoteNo} · ${opts.quoteDate}`];
  if (opts.customerName) out.push(`To: ${opts.customerName}`);
  out.push("");
  opts.lines.forEach((l, i) =>
    out.push(
      `${i + 1}. ${l.description}\n    ${fmtNum(l.qty)} ${UNIT_LABELS[l.unit]} × ${fmtMoney(l.unitPrice)} = ${fmtMoney(lineGross(l))}`,
    ),
  );
  out.push("", `Taxable: ${fmtMoney(opts.totals.taxable)}`, `GST: ${fmtMoney(opts.totals.tax)}`);
  if (opts.totals.roundOff) out.push(`Round off: ${fmtMoney(opts.totals.roundOff)}`);
  out.push(`*Total: ${fmtMoney(opts.totals.total)}* (incl. GST)`);
  if (opts.notes) out.push("", opts.notes);
  if (opts.companyName) out.push("", opts.companyName);
  const d = (opts.customerPhone ?? "").replace(/\D/g, "");
  return `https://wa.me/${d.length === 10 ? "91" + d : d}?text=${encodeURIComponent(out.join("\n"))}`;
}
