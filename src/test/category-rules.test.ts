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

describe("grade of a product", () => {
  it("keeps a valid grade, normalised", async () => {
    const { resolveGrade } = await import("@/lib/category-rules");
    expect(resolveGrade("pe 80", ["PE63", "PE80"])).toBe("PE80");
  });
  it("graded subcategory without a valid grade gets its first grade", async () => {
    const { resolveGrade } = await import("@/lib/category-rules");
    expect(resolveGrade(null, ["PE63", "PE80"])).toBe("PE63");
    expect(resolveGrade("PE999", ["PE80", "PE100"])).toBe("PE80");
  });
  it("ungraded subcategory keeps whatever is there (fitting families)", async () => {
    const { resolveGrade } = await import("@/lib/category-rules");
    expect(resolveGrade("Electrofusion", [])).toBe("Electrofusion");
    expect(resolveGrade(null, [])).toBeNull();
  });
});
