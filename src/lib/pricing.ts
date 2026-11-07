import {
  categoryDefaults,
  ratePerKg,
  sprinklerRateKg,
  type PriceMethod,
  type Rate,
} from "./quote";

// Rate groups are "<category>:<grade>" (pipe:PE80, plb:PE63) for graded categories, else the category id.
// Each category's price method (weight × ₹/kg, sprinkler per piece, fixed base price) decides the formula,
// so no code needs to know group ids by name.
export function groupIdFor(category: string, grade: string | null): string {
  const g = grade?.trim().toUpperCase().replace(/\s+/g, "") ?? "";
  return g && categoryDefaults(category).grades.includes(g) ? `${category}:${g}` : category;
}

// Ids used before the catalog tree (migration 0023 keeps them as a safety net).
const LEGACY: Record<string, string> = {
  PE63: "pipe",
  PE80: "pipe",
  PE100: "pipe",
  SPRINKLER: "sprinkler",
  FITTING: "fitting",
  PLB: "plb",
};
export const categoryOfGroup = (groupId: string): string =>
  LEGACY[groupId] ?? groupId.split(":")[0]!.toLowerCase();

export const priceMethodOf = (groupId: string): PriceMethod =>
  categoryDefaults(categoryOfGroup(groupId)).priceMethod;

export const isPieceGroup = (groupId: string) => priceMethodOf(groupId) === "sprinkler_piece";

// ₹/kg a product of this rate group sells at, given its weight.
export const rateKgFor = (r: Rate, group: string, weightKg: number, nonIsi = false) =>
  isPieceGroup(group) ? sprinklerRateKg(r, weightKg, nonIsi) : ratePerKg(r, nonIsi);

// Bought-in items: the product's base price plus the preset's margin (% or flat ₹).
export const fixedPrice = (r: Rate, basePrice: number) =>
  r.margin_is_pct ? basePrice * (1 + r.margin / 100) : basePrice + r.margin;

// Ex-GST price of one unit of a catalog product.
export function unitPriceFor(
  p: { rate_group_id: string; weight_kg: number; base_price: number | null },
  r: Rate | undefined,
  nonIsi = false,
): number {
  if (!r) return 0;
  if (priceMethodOf(p.rate_group_id) === "fixed") return fixedPrice(r, p.base_price ?? 0);
  return p.weight_kg * rateKgFor(r, p.rate_group_id, p.weight_kg, nonIsi);
}
