import type { Line } from "./quote";
import { isSpec } from "./is4984";
import { PE_DENSITY, pnNumber, sdrFor, wallFor } from "./weights";

export interface PipeSpec {
  od: number; // outside diameter, mm
  wall: number | null; // minimum wall thickness, mm
  wallMax: number | null; // maximum wall thickness, mm (IS 4984 chart), when known
  id: number | null; // inside diameter = OD − 2 × minimum wall, mm
  sdr: number | null;
  grade: string | null; // PE63 / PE80 / PE100
  pn: string | null; // "PN 6"
}

// Wall from weight: kg/m = π·(OD−e)·e·ρ/1000, solved for e.
export function wallFromWeight(od: number, kgPerM: number): number | null {
  const d = od * od - (4000 * kgPerM) / (Math.PI * PE_DENSITY);
  if (!(kgPerM > 0) || d < 0) return null;
  return Math.round(((od - Math.sqrt(d)) / 2) * 10) / 10;
}

// Reads OD / grade / PN from the printed description (works for catalog and custom lines alike).
// Grade + PN give the SDR and so the IS 4984 min–max wall; the quoted weight only stands in for the wall
// on custom lines that name no grade or PN.
export function pipeSpec(
  l: Pick<Line, "category" | "description" | "unit" | "weightKg">,
): PipeSpec | null {
  if (l.category !== "pipe" && l.category !== "sprinkler") return null;
  const od = Number(/(\d{2,4}(?:\.\d+)?)\s*mm\b/i.exec(l.description)?.[1]);
  if (!od) return null;
  const grade = /\bPE\s?(63|80|100)\b/i.exec(l.description)?.[1];
  const pnRaw = /\bPN\s*(\d+(?:\.\d+)?)/i.exec(l.description)?.[1];
  const pn = pnRaw ? `PN ${pnRaw}` : null;
  const isiSdr = grade && pn ? sdrFor(`PE${grade}`, pnNumber(pn)) : null;
  const chart = isiSdr ? isSpec(od, isiSdr) : null;
  const wall =
    chart?.min ??
    (isiSdr ? wallFor(od, isiSdr) : null) ??
    (l.unit === "m" ? wallFromWeight(od, l.weightKg) : null);
  return {
    od,
    wall,
    wallMax: chart?.max ?? null,
    id: wall ? Math.round((od - 2 * wall) * 10) / 10 : null,
    sdr: isiSdr ?? (wall ? Math.round((od / wall) * 10) / 10 : null),
    grade: grade ? `PE${grade}` : null,
    pn,
  };
}
