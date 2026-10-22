// HDPE pipe weight from IS 4984:2016. PN = 0.8 · 20σ / (SDR − 1), σ = design stress per grade (MPa),
// so each grade + PN maps to an SDR. Wall = OD/SDR rounded up to 0.1 mm (min 2 mm); kg/m = π·(OD−e)·e·ρ.
// ponytail: approximates the standard's tables (±~2%); weights stay editable per product.
export const PE_DENSITY = 0.95;

const SIGMA: Record<string, number> = { PE63: 5, PE80: 6.3, PE100: 8 };
const SDR_SERIES = [41, 33, 26, 21, 17, 13.6, 11, 9, 7.4, 6];

// Thinnest standard SDR whose rated pressure meets the PN.
export function sdrFor(grade: string, pn: number): number | null {
  const s = SIGMA[grade.toUpperCase()];
  if (!s || !pn) return null;
  return SDR_SERIES.find((sdr) => (16 * s) / (sdr - 1) >= pn - 0.4) ?? null;
}

export function pipeKgPerM(od: number, sdr: number): number {
  const e = Math.max(2, Math.ceil((od / sdr) * 10 - 1e-9) / 10);
  return (Math.PI * (od - e) * e * PE_DENSITY) / 1000;
}

export const pnNumber = (pn: string | null) => Number((pn ?? "").replace(/[^\d.]/g, "")) || 0;
