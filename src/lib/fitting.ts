// Non-branded fittings are quoted by typing the product, its size, a quantity and a price.
export const FITTING_PRODUCTS = [
  "Coupler",
  "Elbow 90°",
  "Elbow 45°",
  "Tee",
  "Reducing tee",
  "Reducer",
  "End cap",
  "Saddle",
  "Taping tee",
  "4-way",
  "Y-way",
  "Tail piece",
  "Stub end",
  "Slip-on flange",
  "Blind flange",
  "Ball valve",
];

// Pipe outside diameters in mm, as printed on the supplier price lists.
export const FITTING_SIZES = [
  20, 25, 32, 40, 50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450,
].map(String);

// "63" -> "63 mm"; "90x63" -> "90 × 63 mm"; anything else is kept as typed ('2" BSP').
export function fittingSize(s: string): string {
  const t = s.trim().replace(/\s*[x×X]\s*/g, " × ");
  if (!t) return "";
  return /^\d+(\.\d+)?( × \d+(\.\d+)?)?$/.test(t) ? `${t} mm` : t;
}

// "Elbow 90°" + "63" + "Electrofusion" -> "Elbow 90° 63 mm · Electrofusion"
export function fittingName(product: string, size: string, description = ""): string {
  const main = [product.trim(), fittingSize(size)].filter(Boolean).join(" ");
  return description.trim() ? `${main} · ${description.trim()}` : main;
}

// List price less a percentage discount, to the paisa.
export const netPrice = (list: number, discountPct: number) =>
  Math.round(list * (1 - Math.min(100, Math.max(0, discountPct)) / 100) * 100) / 100;
