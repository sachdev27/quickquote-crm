import { categoryDefaults, isRegisteredCategory, type Drawing, type Line } from "./quote";
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
// Drawing a line gets on the quote: the subcategory's setting, else the built-in one for the original categories.
const BUILT_IN: Record<string, Drawing> = {
  pipe: "pipe",
  sprinkler: "pipe",
  fitting: "fitting",
  dwc: "dwc",
};
export const drawingOf = (category: string): Drawing =>
  isRegisteredCategory(category)
    ? categoryDefaults(category).drawing
    : (BUILT_IN[category] ?? "none");

// "(Colour: Orange, …)" as quoteTitle prints a product's custom specifications.
export const colourOf = (description: string): string | null =>
  /\(\s*(?:[^()]*,\s*)?Colou?r:\s*([^,)]+)/i.exec(description)?.[1]?.trim() ?? null;

// DWC: nominal inside diameter (DN) and ring stiffness class from the printed description.
export function dwcSpec(
  l: Pick<Line, "category" | "description">,
): { dn: number; cls: string | null } | null {
  if (drawingOf(l.category) !== "dwc") return null;
  const dn = Number(
    /\bDN\s*(\d{2,4})/i.exec(l.description)?.[1] ?? /(\d{2,4})\s*mm\b/i.exec(l.description)?.[1],
  );
  if (!dn) return null;
  const sn = /\bSN\s*(\d+)/i.exec(l.description)?.[1];
  return { dn, cls: sn ? `SN ${sn}` : null };
}

export function pipeSpec(
  l: Pick<Line, "category" | "description" | "unit" | "weightKg">,
): PipeSpec | null {
  const d = drawingOf(l.category);
  if (d !== "pipe" && d !== "sprinkler") return null;
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
