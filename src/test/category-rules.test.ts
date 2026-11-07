import { describe, expect, it } from "vitest";
import { rateRowsFor, removedGradesInUse } from "@/lib/category-rules";

describe("rate rows for a subcategory", () => {
  it("one row per profile x preset x grade", () => {
    const rows = rateRowsFor("dwc", ["PE80", "PE100"], ["p1"], ["s1", "s2"]);
    expect(rows).toHaveLength(4);
    expect(rows).toContainEqual({ profile_id: "p1", preset_id: "s2", group_id: "dwc:PE100" });
  });
  it("ungraded subcategory uses its own id as the group", () => {
    expect(rateRowsFor("acc", [], ["p1"], ["s1"])).toEqual([
      { profile_id: "p1", preset_id: "s1", group_id: "acc" },
    ]);
  });
});

describe("removing grades", () => {
  it("reports a removed grade that products still use", () => {
    expect(removedGradesInUse(["PE63", "PE80"], ["PE80"], [{ grade: "PE63" }])).toEqual(["PE63"]);
  });
  it("allows removing an unused grade", () => {
    expect(removedGradesInUse(["PE63"], [], [{ grade: "PE80" }])).toEqual([]);
  });
});
