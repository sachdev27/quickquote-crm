// Tax invoice numbering. GST Rule 46: a consecutive serial number of at most 16 characters
// (letters, numerals, "-" and "/"), unique for the financial year (April to March).

// "2026-10-23" -> "2627"; "2027-02-01" -> "2627"
export function fyOf(date: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(date);
  if (!m) throw new Error(`Bad date: ${date}`);
  const start = Number(m[2]) >= 4 ? Number(m[1]) : Number(m[1]) - 1;
  return `${String(start).slice(2)}${String(start + 1).slice(2)}`;
}

export const invoicePrefix = (code: string, date: string) => `${code}/${fyOf(date)}/`;

export const invoiceNoOf = (code: string, date: string, seq: number) =>
  `${invoicePrefix(code, date)}${String(seq).padStart(4, "0")}`;

// Today in India (the legal invoice date), whatever the server clock says.
export const todayIST = (now = Date.now()) =>
  new Date(now + 5.5 * 3600e3).toISOString().slice(0, 10);
