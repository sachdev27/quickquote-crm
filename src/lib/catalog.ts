import { CATEGORY_LABELS, type Category } from "./quote";

export const LAST_LIST = "tarko.lastPriceList";
export const LAST_BRAND = "tarko.lastBrand";

type P = { category: string; name: string; grade: string | null; roll: string | null; size_mm: number | null; pn: string | null; inch: string | null };

export function sectionOf(p: P) {
  if (p.category !== "pipe") return CATEGORY_LABELS[p.category as Category];
  return `HDPE ${p.grade ?? ""} · ${p.roll === "cut" ? "Cut roll" : "Complete roll"}`;
}

export function shortName(p: P) {
  return p.category === "pipe" && p.size_mm ? `${p.size_mm} mm${p.inch ? ` (${p.inch})` : ""} · ${p.pn ?? ""}` : p.name;
}
