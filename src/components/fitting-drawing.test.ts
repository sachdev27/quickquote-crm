import { describe, expect, it } from "vitest";
import { fittingKind } from "./fitting-drawing";

describe("fittingKind", () => {
  it("maps every catalog fitting name to a drawing", () => {
    const cases: [string, string][] = [
      ["Coupler 63 mm", "coupler"],
      ["Elbow 90° 63 mm", "elbow90"],
      ["Elbow 45° 63 mm", "elbow45"],
      ["Tee 63 mm", "tee"],
      ["Reducing tee 90 × 63 mm", "redtee"],
      ["Reducer 90 × 63 mm", "reducer"],
      ["Saddle 110 × 63 mm", "saddle"],
      ["Taping tee 110 × 63 mm", "saddle"],
      ["4-way 63 mm", "cross"],
      ["Y-way 63 mm", "ywye"],
      ["End cap 63 mm", "cap"],
      ["Blind flange 110 mm", "blindflange"],
      ["Slip-on flange 110 mm", "slipflange"],
      ["Tail piece with flange 110 mm", "tailflange"],
      ["Tail piece 110 mm", "tail"],
      ["L.N pipe end 110 mm", "stubend"],
      ["Elbow 90° PN 10 63 mm", "elbow90"],
      ["Elbow 45° PN 6 180 mm", "elbow45"],
      ["Tee PN 6 63 mm", "tee"],
      ["4-way PN 10 63 mm", "cross"],
      ["Y-way PN 6 63 mm", "ywye"],
      ["Saddle with bottom 63 × 20 mm", "saddle"],
    ];
    for (const [name, kind] of cases) expect(fittingKind(name), name).toBe(kind);
    expect(fittingKind("Something else")).toBeNull();
  });
});

import { matchesSearch } from "@/lib/catalog";
describe("matchesSearch", () => {
  it("ignores spaces, hyphens and word order", () => {
    expect(matchesSearch("4-way 63 mm Electrofusion", "4 way")).toBe(true);
    expect(matchesSearch("4-way 63 mm Electrofusion", "63 4way")).toBe(true);
    expect(matchesSearch("Saddle with bottom 90 × 25 mm", "saddle with 90")).toBe(true);
    expect(matchesSearch("Tee 63 mm", "4 way")).toBe(false);
  });
});

import { splitFittingName } from "@/lib/fitting";
describe("splitFittingName", () => {
  it("keeps the pressure class in the product", () => {
    expect(splitFittingName("Elbow 90° PN 10 63 mm")).toEqual({
      product: "Elbow 90° PN 10",
      size: "63",
    });
    expect(splitFittingName("Saddle with bottom 90 × 25 mm")).toEqual({
      product: "Saddle with bottom",
      size: "90x25",
    });
  });
});
