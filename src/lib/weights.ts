import { IS_PN, IS_SDRS, isSpec } from "./is4984";

// HDPE pipe weight from IS 4984:2016. Clause 3.18: P (MPa) = 2σ / (SDR − 1) · fT, σ = design stress per grade
// (Table 1: 5 / 6.3 / 8 MPa), fT = 0.85 at 27 °C; PN (bar) = 10·P rounded down to the PN series. That
// reproduces every grade + SDR → PN pair of Table 4, so each grade + PN maps to an SDR. Wall and kg/m come from the standard's chart (is4984.ts); sizes
// off the chart fall back to wall = OD/SDR rounded up to 0.1 mm (min 2 mm), kg/m = π·(OD−e)·e·ρ.
// ρ fitted to the factory chart: its kg/m is π·(OD − ē)·ē·ρ with ē = mean of min and max wall (all 286 cells within 1%).
export const PE_DENSITY = 0.9734;

const SIGMA: Record<string, number> = { PE63: 5, PE80: 6.3, PE100: 8 };
const SDR_SERIES = [41, 33, 26, 21, 17, 13.6, 11, 9, 7.4, 6];

export const PRESSURE_FT = 0.85;
// Thinnest standard SDR whose rated pressure (bar) meets the PN.
export function sdrFor(grade: string, pn: number): number | null {
  const i = IS_PN[grade.toUpperCase()]?.indexOf(pn) ?? -1;
  if (i >= 0) return IS_SDRS[i]!;
  const s = SIGMA[grade.toUpperCase()];
  if (!s || !pn) return null;
  return SDR_SERIES.find((sdr) => (20 * s * PRESSURE_FT) / (sdr - 1) >= pn - 1e-9) ?? null;
}

// Minimum wall (mm) for an OD and SDR, as IS 4984 rounds it.
export const wallFor = (od: number, sdr: number) =>
  isSpec(od, sdr)?.min ?? Math.max(2, Math.ceil((od / sdr) * 10 - 1e-9) / 10);

export function pipeKgPerM(od: number, sdr: number): number {
  const t = isSpec(od, sdr);
  if (t) return t.kgPerM;
  const e = wallFor(od, sdr);
  const mean = e + (0.1 * e + 0.1) / 2; // the standard's max wall is min + (0.1·min + 0.1), rounded up
  return (Math.PI * (od - mean) * mean * PE_DENSITY) / 1000;
}

export const pnNumber = (pn: string | null) => Number((pn ?? "").replace(/[^\d.]/g, "")) || 0;
