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

// ---- the fitting products in the catalog -> the options on the quote form ----
export type FittingRow = {
  name: string;
  grade: string | null;
  hsn: string | null;
  gst_rate: number;
};
export type FittingGroup = {
  key: string; // "<family>|<product>"
  family: string;
  product: string;
  pair: boolean;
  sizes: string[]; // "63" or "90x63"
  hsn: string | null;
  gst: number;
};

// "Reducer 90 × 63 mm" -> { product: "Reducer", size: "90x63" }; names that don't end in a size keep
// the whole name as the product and have no listed sizes.
export function splitFittingName(name: string): { product: string; size: string } {
  const m = /^(.*?)\s+(\d+(?:\s*[×x]\s*\d+)?)\s*mm$/i.exec(name.trim());
  return m
    ? { product: m[1]!.trim(), size: m[2]!.replace(/\s*[×x]\s*/i, "x") }
    : { product: name.trim(), size: "" };
}

export function groupFittings(rows: FittingRow[]): FittingGroup[] {
  const m = new Map<string, FittingGroup>();
  for (const r of rows) {
    const { product, size } = splitFittingName(r.name);
    const family = r.grade ?? "Fitting";
    const key = `${family}|${product}`;
    const g = m.get(key) ?? {
      key,
      family,
      product,
      pair: false,
      sizes: [],
      hsn: r.hsn,
      gst: r.gst_rate,
    };
    if (size) {
      g.sizes.push(size);
      if (size.includes("x")) g.pair = true;
    }
    m.set(key, g);
  }
  return [...m.values()];
}
