import { CATEGORY_LABELS, type Category } from "./quote";

export const LAST_BRAND = "tarko.lastBrand";
export const LAST_PRESET = "tarko.lastPreset";

type P = {
  category: string;
  name: string;
  grade: string | null;
  roll: string | null;
  size_mm: number | null;
  pn: string | null;
  inch: string | null;
};

export function sectionOf(p: P) {
  // Fittings are grouped by family, which is kept in the grade column (Electrofusion, Spigot moulded, ...).
  if (p.category === "fitting" && p.grade) return `Fitting · ${p.grade}`;
  if (p.category !== "pipe") return CATEGORY_LABELS[p.category as Category];
  return `HDPE ${p.grade ?? ""} pipe`;
}

export function shortName(p: P) {
  return p.category === "pipe" && p.size_mm
    ? `${p.size_mm} mm${p.inch ? ` (${p.inch})` : ""} · ${p.pn ?? ""}`
    : p.name;
}

// One catalog row for a new HDPE pipe (used by the quote picker's "+ New" and the weight chart).
export function newPipe(o: {
  grade: string;
  roll: string;
  size: number;
  inch: string;
  pn: string;
  lens: string;
  weight: number;
  groupId: string;
}) {
  const pn = normalizePn(o.pn);
  return {
    category: "pipe" as const,
    rate_group_id: o.groupId,
    grade: o.grade,
    roll: o.roll,
    size_mm: o.size,
    inch: o.inch || null,
    pn,
    roll_lengths: o.roll === "cut" ? null : o.lens || null,
    unit: "m" as const,
    weight_kg: o.weight,
    gst_rate: 18,
    hsn: "3917 21 90",
    name: `HDPE Pipe ${o.grade} ${o.size} mm${o.inch ? ` (${o.inch})` : ""} ${pn}${o.roll === "cut" ? " · cut roll" : ""}`,
    active: true,
  };
}

export const normalizePn = (s: string) => {
  const v = s
    .trim()
    .toUpperCase()
    .replace(/^PN\s*/, "");
  return v ? `PN ${v}` : "";
};

// Printed description of a catalog product: Brand (pipes, sprinklers) · name · PN rating, each only if
// present and not already written in the name.
export const quoteTitle = (
  p: { category: string; name: string; pn: string | null },
  brand?: string,
) => {
  const has = (t: string) => p.name.toLowerCase().includes(t.toLowerCase());
  const pn = p.pn ? normalizePn(p.pn) : "";
  return [
    (p.category === "pipe" || p.category === "sprinkler") && brand && !has(brand) ? brand : "",
    p.category === "sprinkler" && !has("sprinkler") ? "Sprinkler Pipe" : "",
    p.name,
    pn && !has(pn) ? pn : "",
  ]
    .filter(Boolean)
    .join(" ");
};
