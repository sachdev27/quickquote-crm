import { CATEGORY_LABELS, categoryDefaults, type Category } from "./quote";

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
  const label = CATEGORY_LABELS[p.category] ?? p.category;
  const d = categoryDefaults(p.category);
  // graded subcategories: "HDPE Pipe PE80", "PLB Duct Pipe PE63"
  if (p.grade && d.grades.includes(p.grade)) return `${label} ${p.grade}`;
  // ungraded ones keep the grade column for a family (fittings: Electrofusion, Spigot moulded, ...)
  if (p.grade && !d.grades.length && (d.drawing === "fitting" || p.category === "fitting"))
    return `${label} · ${p.grade}`;
  return label;
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
  p: {
    category: string;
    name: string;
    pn: string | null;
    grade?: string | null;
    specs?: string | null;
  },
  brand?: string,
) => {
  // fittings: "4-way 63 mm · Electrofusion" (the family tells electrofusion and spigot apart)
  if (p.category === "fitting")
    return p.grade && !p.name.toLowerCase().includes(p.grade.toLowerCase())
      ? `${p.name} · ${p.grade}`
      : p.name;
  const has = (t: string) => p.name.toLowerCase().includes(t.toLowerCase());
  let specs = "";
  try {
    // custom specifications print after the name: "(Colour: Yellow, Wall thickness (mm): 3)"
    specs = Object.entries(JSON.parse(p.specs ?? "{}") as Record<string, string>)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  } catch {
    /* ignore bad JSON */
  }
  const pn = p.pn ? normalizePn(p.pn) : "";
  return [
    (p.category === "pipe" || p.category === "sprinkler") && brand && !has(brand) ? brand : "",
    p.category === "sprinkler" && !has("sprinkler") ? "Sprinkler Pipe" : "",
    p.name,
    // graded subcategories (sprinkler PE 63 / PE 80 twins) print their grade
    p.grade && categoryDefaults(p.category).grades.includes(p.grade) && !has(p.grade)
      ? p.grade
      : "",
    pn && !has(pn) ? pn : "",
    specs ? `(${specs})` : "",
  ]
    .filter(Boolean)
    .join(" ");
};

// Search: every typed word must appear, ignoring case, spaces and punctuation ("4 way" finds "4-way 63 mm").
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]/g, "");
export const matchesSearch = (haystack: string, query: string) => {
  const h = squash(haystack);
  return query
    .split(/\s+/)
    .map(squash)
    .filter(Boolean)
    .every((t) => h.includes(t));
};
