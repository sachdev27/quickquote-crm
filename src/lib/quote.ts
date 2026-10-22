import type { Standard } from "./pipe-data";

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

export interface QuoteRow {
  id: string;
  quote_no: string;
  customer_id: string | null;
  quote_date: string;
  status: string;
  gst_rate: number;
  raw_rate_kg: number;
  production_cost_kg: number;
  transport_kg: number;
  margin_pct: number;
  extra_charges: number;
  notes: string | null;
  customers?: { name: string } | null;
}

export interface QuoteItemRow {
  id: string;
  quote_id: string;
  standard: string;
  size: string;
  dr: string;
  od_in: number | null;
  weight_kgm: number | null;
  length_ft: number;
  pieces: number;
  sell_rate_kg: number;
}

export interface SettingsRow {
  user_id: string;
  company_name: string | null;
  company_address: string | null;
  company_phone: string | null;
  company_gstin: string | null;
  default_raw_rate_kg: number;
  default_production_kg: number;
  default_transport_kg: number;
  default_margin_pct: number;
  default_gst_rate: number;
}

export interface Pricing {
  raw: number;
  production: number;
  transport: number;
  marginPct: number;
}

export interface DraftItem {
  key: string;
  standard: Standard;
  size: string;
  dr: string;
  odIn: number;
  weightKgm: number;
  lengthFt: number;
  pieces: number;
  rate: number;
}

export const GST_OPTIONS = [0, 5, 12, 18, 28];

export const FT_TO_M = 0.3048;

export function costPerKg(p: Pricing): number {
  return p.raw + p.production + p.transport;
}

export function sellRatePerKg(p: Pricing): number {
  return costPerKg(p) * (1 + p.marginPct / 100);
}

export interface LineItemLike {
  weightKgm: number;
  lengthFt: number;
  pieces: number;
  rate: number;
}

export function itemWeightKg(item: LineItemLike): number {
  return item.weightKgm * item.lengthFt * FT_TO_M * item.pieces;
}

export function itemAmount(item: LineItemLike): number {
  return itemWeightKg(item) * item.rate;
}

export interface Totals {
  itemsSubtotal: number;
  extraCharges: number;
  taxable: number;
  gstAmount: number;
  total: number;
  totalWeightKg: number;
}

export function computeTotals(
  items: { weightKgm: number; lengthFt: number; pieces: number; rate: number }[],
  extraCharges: number,
  gstRate: number
): Totals {
  const itemsSubtotal = items.reduce((s, it) => s + itemWeightKg(it) * it.rate, 0);
  const totalWeightKg = items.reduce((s, it) => s + itemWeightKg(it), 0);
  const taxable = itemsSubtotal + extraCharges;
  const gstAmount = taxable * (gstRate / 100);
  return {
    itemsSubtotal,
    extraCharges,
    taxable,
    gstAmount,
    total: taxable + gstAmount,
    totalWeightKg,
  };
}

export function computeTotalsFromRows(items: QuoteItemRow[], extraCharges: number, gstRate: number): Totals {
  const itemsSubtotal = items.reduce(
    (s, it) => s + (it.weight_kgm ?? 0) * it.length_ft * FT_TO_M * it.pieces * it.sell_rate_kg,
    0
  );
  const totalWeightKg = items.reduce((s, it) => s + (it.weight_kgm ?? 0) * it.length_ft * FT_TO_M * it.pieces, 0);
  const taxable = itemsSubtotal + extraCharges;
  const gstAmount = taxable * (gstRate / 100);
  return {
    itemsSubtotal,
    extraCharges,
    taxable,
    gstAmount,
    total: taxable + gstAmount,
    totalWeightKg,
  };
}

export function fmtMoney(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

export function fmtNum(n: number, digits = 2): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

export function nextQuoteNo(count: number, date = new Date()): string {
  const ym = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}`;
  return `Q-${ym}-${String(count + 1).padStart(3, "0")}`;
}

export function drLabel(dr: string): string {
  return `DR ${dr}`;
}

export function drClass(dr: string): string {
  return `Class ${DR_CLASS_MAP[dr] ?? "?"}`;
}

export const DR_CLASS_MAP: Record<string, string> = {
  "32.5": "65",
  "26": "80",
  "21": "100",
  "19": "110",
  "17": "130",
  "13.5": "160",
  "11": "200",
  "9": "250",
  "7": "335",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  won: "Won",
  lost: "Lost",
};

export function buildWhatsAppText(opts: {
  quoteNo: string;
  quoteDate: string;
  customerName?: string | null;
  customerPhone?: string | null;
  companyName?: string | null;
  gstRate: number;
  items: { size: string; standard: string; dr: string; pieces: number; lengthFt: number; weightKg: number; rate: number }[];
  totals: Totals;
  notes?: string | null;
}): string {
  const lines: string[] = [];
  lines.push("*PROFORMA QUOTATION*");
  lines.push(`Quote No: ${opts.quoteNo}`);
  lines.push(`Date: ${opts.quoteDate}`);
  if (opts.customerName) lines.push(`Customer: ${opts.customerName}`);
  lines.push("");
  opts.items.forEach((it, i) => {
    const amount = it.weightKg * it.rate;
    lines.push(
      `${i + 1}. ${it.size} ${it.standard} ${drLabel(it.dr)} — ${it.pieces} × ${it.lengthFt} ft — ${fmtNum(
        it.weightKg
      )} kg @ ${fmtMoney(it.rate)}/kg — ${fmtMoney(amount)}`
    );
  });
  lines.push("");
  lines.push(`Subtotal: ${fmtMoney(opts.totals.itemsSubtotal)}`);
  if (opts.totals.extraCharges > 0) lines.push(`Extra charges: ${fmtMoney(opts.totals.extraCharges)}`);
  lines.push(`GST @ ${opts.gstRate}%: ${fmtMoney(opts.totals.gstAmount)}`);
  lines.push(`*Total: ${fmtMoney(opts.totals.total)}*`);
  if (opts.notes) {
    lines.push("");
    lines.push(opts.notes);
  }
  lines.push("");
  if (opts.companyName) lines.push(opts.companyName);
  lines.push("Prices valid subject to final confirmation.");

  const phone = opts.customerPhone ? opts.customerPhone.replace(/\D/g, "") : "";
  const base = phone ? `https://wa.me/${phone}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(lines.join("\n"))}`;
}
