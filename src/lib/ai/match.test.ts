import { describe, expect, it } from "vitest";
import { matchItem, quoteQty } from "./match";
import { extractionSchema } from "./inbound";

const pipe = (id: string, od: number, pn: string, grade: string, roll = "complete") => ({
  id,
  category: "pipe",
  name: `HDPE Pipe ${grade} ${od}`,
  grade,
  size_mm: od,
  pn,
  roll,
  unit: "m",
  roll_lengths: "100/200",
});
const products = [
  pipe("a", 32, "PN 6", "PE63"),
  pipe("b", 32, "PN 6", "PE80"),
  pipe("c", 32, "PN 6", "PE63", "cut"),
  pipe("d", 63, "PN 10", "PE100"),
];
const item = (o: object) =>
  extractionSchema.parse({ items: [{ raw: "x", kind: "pipe", ...o }] }).items[0]!;

describe("matchItem", () => {
  it("matches OD + PN + grade exactly", () => {
    const m = matchItem(item({ od_mm: 32, pn: 6, grade: "PE63" }), products);
    expect(m.status).toBe("matched");
    expect(m.candidates[0]!.id).toBe("a");
  });
  it("is ambiguous without a grade, preferring full rolls", () => {
    const m = matchItem(item({ od_mm: 32, pn: 6 }), products);
    expect(m.status).toBe("ambiguous");
    expect(m.candidates.map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("reports none for sizes not in the catalog", () => {
    expect(matchItem(item({ od_mm: 40, pn: 6 }), products).status).toBe("none");
  });
});

describe("quoteQty", () => {
  it("converts rolls to metres using the first roll length", () => {
    expect(quoteQty(item({ qty: 3, unit: "rolls" }), products[0]!)).toBe(300);
    expect(quoteQty(item({ qty: 250, unit: "m" }), products[0]!)).toBe(250);
  });
});

describe("extractionSchema", () => {
  it("tolerates stringy numbers and unknown kinds", () => {
    const e = extractionSchema.parse({
      items: [{ raw: "r", kind: "weird", od_mm: "63", qty: "2" }],
    });
    expect(e.items[0]).toMatchObject({ kind: "other", od_mm: 63, qty: 2, unit: null });
  });
});
