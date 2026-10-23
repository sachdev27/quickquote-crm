// Non-branded fittings are quoted by typing the product, its size, a quantity and a price.
// Products from the supplier price sheets. `pair` = priced by two sizes ("90 × 63"): reducers,
// reducing tees and saddles (pipe × outlet). Prices are not stored: you type them on the quote.
export type FittingDef = { family: string; product: string; pair?: boolean };

export const FITTING_LIST: FittingDef[] = [
  // HDPE electrofusion fittings (CPI, SDR-11)
  { family: "Electrofusion", product: "Coupler" },
  { family: "Electrofusion", product: "Elbow 90°" },
  { family: "Electrofusion", product: "Elbow 45°" },
  { family: "Electrofusion", product: "Tee" },
  { family: "Electrofusion", product: "End cap" },
  { family: "Electrofusion", product: "Taping tee" },
  { family: "Electrofusion", product: "Saddle", pair: true },
  { family: "Electrofusion", product: "Reducer", pair: true },
  { family: "Electrofusion", product: "Reducing tee", pair: true },
  { family: "Electrofusion", product: "4-way" },
  { family: "Electrofusion", product: "Y-way" },
  // HDPE spigot moulded fittings
  { family: "Spigot moulded", product: "Elbow 90°" },
  { family: "Spigot moulded", product: "Elbow 45°" },
  { family: "Spigot moulded", product: "Tee" },
  { family: "Spigot moulded", product: "End cap" },
  { family: "Spigot moulded", product: "4-way" },
  { family: "Spigot moulded", product: "Y-way" },
  { family: "Spigot moulded", product: "Reducer", pair: true },
  { family: "Spigot moulded", product: "Reducing tee", pair: true },
  // HDPE pipe fittings (pipe ends and flanges)
  { family: "Pipe fitting", product: "L.N pipe end" },
  { family: "Pipe fitting", product: "Slip-on flange" },
  { family: "Pipe fitting", product: "Blind flange" },
  { family: "Pipe fitting", product: "End cap" },
  { family: "Pipe fitting", product: "Tail piece" },
  { family: "Pipe fitting", product: "Tail piece with flange" },
  // Butt-weld reducers
  { family: "Butt-weld", product: "Reducer", pair: true },
];
export const fittingKey = (d: FittingDef) => `${d.family}|${d.product}`;

// Pipe outside diameters in mm, as printed on the supplier price lists.
export const FITTING_SIZES = [
  20, 25, 32, 40, 50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450,
].map(String);

// Sizes with a second one: "90" + "63" -> "90x63".
export const pairSize = (a: string, b: string) => (a && b ? `${a}x${b}` : a || b);

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
