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
    ];
    for (const [name, kind] of cases) expect(fittingKind(name), name).toBe(kind);
    expect(fittingKind("Something else")).toBeNull();
  });
});
