import { UNIT_LABELS, computeTotals, fmtMoney, fmtNum, type Line } from "./quote";
import { baseDesc, parseRoll } from "./rolls";

export interface AuditLine {
  description: string;
  unit: Line["unit"];
  qty: number;
  weightKg: number;
  rateKg: number;
  unitPrice: number;
  gstRate: number;
}
export interface AuditSnap {
  customer: string | null;
  brand: string | null;
  igst: boolean;
  nonIsi: boolean;
  extra: number;
  notes: string | null;
  terms: string | null;
  lines: AuditLine[];
}

const MAX = 400;
const same = (a: number, b: number) => Math.abs(a - b) < 0.005;
// "HDPE Pipe PE63 32 mm (1") PN 6 · 3 rolls × 300 m" -> "PE63 32 mm PN 6"
const name = (d: string, n = 28) => {
  const s = baseDesc(d)
    .replace(/^HDPE\s+Pipe\s+/i, "")
    .replace(/\s*\([^)]*\)/, "")
    .trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const rollOf = (d: string) => {
  const r = parseRoll(d);
  return r ? `${fmtNum(r.rolls)}×${fmtNum(r.len)} m` : null;
};
const rate = (l: AuditLine) =>
  l.weightKg > 0 ? `₹${fmtNum(l.rateKg)}/kg` : `₹${fmtNum(l.unitPrice)}/${UNIT_LABELS[l.unit]}`;
const total = (s: AuditSnap) =>
  computeTotals(
    s.lines.map((l) => ({ ...l, hsn: null })),
    s.extra,
    { inclusive: false, igst: s.igst },
  ).total;

// One short sentence per save: only what changed, old → new. Empty string = nothing changed.
export function describeChanges(a: AuditSnap, b: AuditSnap): string {
  const out: string[] = [];
  if ((a.customer ?? "") !== (b.customer ?? ""))
    out.push(`Customer ${a.customer ?? "—"} → ${b.customer ?? "—"}`);
  if ((a.brand ?? "") !== (b.brand ?? "")) out.push(`Brand ${a.brand ?? "—"} → ${b.brand ?? "—"}`);
  if (a.igst !== b.igst) out.push(`IGST ${b.igst ? "on" : "off"}`);
  if (a.nonIsi !== b.nonIsi) out.push(`Non-ISI ${b.nonIsi ? "on" : "off"}`);
  if (!same(a.extra, b.extra)) out.push(`Freight ${fmtMoney(a.extra)} → ${fmtMoney(b.extra)}`);
  if ((a.notes ?? "") !== (b.notes ?? "")) out.push("Notes edited");
  if ((a.terms ?? "") !== (b.terms ?? "")) out.push("Terms edited");

  const n = Math.min(a.lines.length, b.lines.length);
  for (let i = 0; i < n; i++) {
    const x = a.lines[i]!;
    const y = b.lines[i]!;
    const d: string[] = [];
    if (baseDesc(x.description) !== baseDesc(y.description)) d.push(`now ${name(y.description)}`);
    if (!same(x.qty, y.qty))
      d.push(`qty ${fmtNum(x.qty)} → ${fmtNum(y.qty)} ${UNIT_LABELS[y.unit]}`);
    const rx = rollOf(x.description);
    const ry = rollOf(y.description);
    if (rx !== ry && (rx || ry)) d.push(rx ? `rolls ${rx} → ${ry ?? "—"}` : `rolls ${ry}`);
    if (!same(x.weightKg > 0 ? x.rateKg : x.unitPrice, y.weightKg > 0 ? y.rateKg : y.unitPrice))
      d.push(`rate ${rate(x)} → ${rate(y)}`);
    if (!same(x.gstRate, y.gstRate)) d.push(`GST ${fmtNum(x.gstRate)} → ${fmtNum(y.gstRate)}%`);
    if (d.length) out.push(`Item ${i + 1} (${name(x.description, 22)}): ${d.join(", ")}`);
  }
  for (let i = n; i < b.lines.length; i++) out.push(`Added ${name(b.lines[i]!.description)}`);
  for (let i = n; i < a.lines.length; i++) out.push(`Removed ${name(a.lines[i]!.description)}`);

  if (!out.length && total(a) === total(b)) return "";
  const ta = total(a);
  const tb = total(b);
  if (ta !== tb) out.push(`Total ${fmtMoney(ta)} → ${fmtMoney(tb)}`);
  const s = out.join("; ");
  return s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s;
}
