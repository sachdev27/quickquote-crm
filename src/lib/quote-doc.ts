// Helpers for the printed quotation (CGST Rule 46 style particulars).

// GST state codes: first two digits of a GSTIN.
const STATES: Record<string, string> = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman & Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

// "27ABCDE1234F1Z5" -> "Maharashtra (27)"
export function stateOf(gstin: string | null | undefined): string | null {
  const code = /^\s*(\d{2})/.exec(gstin ?? "")?.[1];
  return code && STATES[code] ? `${STATES[code]} (${code})` : null;
}

// Validity comes from the terms the quote was sent with ("Prices valid for 7 days ..."), if any.
export function validUntil(quoteDate: string, terms: string[]): string | null {
  const days = terms.map((t) => /valid\w*\D{0,30}?(\d{1,3})\s*days?/i.exec(t)?.[1]).find(Boolean);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(quoteDate);
  if (!days || !m) return null;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]! + Number(days)));
  return d.toISOString().slice(0, 10);
}

// "2026-10-23" -> "23 Oct 2026"; anything else prints as stored.
export function fmtDate(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Table amounts: always two decimals, Indian grouping, no symbol (the column header says ₹).
export const fmtAmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
