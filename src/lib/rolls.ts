// Pipe lines carry their roll layout in the description: "… PN 6 · 3 rolls × 300 m".
// The helpers keep that suffix in step with the quantity and roll length the user edits.
const SUFFIX = /\s*·\s*(\d+(?:\.\d+)?)\s*rolls?\s*×\s*(\d+(?:\.\d+)?)\s*m\s*$/i;

export const baseDesc = (d: string) => d.replace(SUFFIX, "").trim();

export function parseRoll(d: string): { rolls: number; len: number } | null {
  const m = SUFFIX.exec(d);
  return m ? { rolls: Number(m[1]), len: Number(m[2]) } : null;
}

// Whole rolls only; a part roll (650 m on 300 m rolls) is just metres, with no suffix.
export function withRolls(d: string, qty: number, len: number): string {
  const base = baseDesc(d);
  if (!(len > 0) || !(qty > 0)) return base;
  const rolls = qty / len;
  if (Math.abs(rolls - Math.round(rolls)) > 1e-9) return base;
  return `${base} · ${Math.round(rolls)} roll${Math.round(rolls) > 1 ? "s" : ""} × ${len} m`;
}
