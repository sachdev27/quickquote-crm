import { describe, expect, it } from "vitest";
import { planMatrixSync, type MatrixCell } from "@/lib/matrix-sync";

const cell = (p: Partial<MatrixCell> = {}): MatrixCell => ({
  id: "c1",
  category_id: "dwc",
  grade: null,
  size_mm: 110,
  size_label: "DN 110",
  class: "SN 8",
  kg_per_m: 1.2,
  od_mm: 125,
  id_mm: 110,
  wall_mm: null,
  ...p,
});
const prod = (p: Partial<Parameters<typeof planMatrixSync>[3][number]> = {}) => ({
  id: "p1",
  category: "dwc",
  grade: "PE80",
  size_mm: 110,
  pn: "SN 8",
  active: 1,
  weight_kg: 1.2,
  ...p,
});
const GRADES = ["PE80", "PE100"];

describe("weight matrix → products", () => {
  it("a new cell with no grade adds one product per grade", () => {
    const plan = planMatrixSync([cell()], [], GRADES, [], "DWC Pipe");
    expect(plan.insert).toHaveLength(2);
    expect(plan.insert.map((p) => p.rate_group_id).sort()).toEqual(["dwc:PE100", "dwc:PE80"]);
    expect(plan.insert[0]).toMatchObject({
      category: "dwc",
      size_mm: 110,
      pn: "SN 8",
      weight_kg: 1.2,
      unit: "m",
    });
    expect(plan.insert.find((p) => p.grade === "PE80")?.name).toBe("DWC Pipe PE80 DN 110 SN 8");
  });

  it("an existing product with the same key is updated, not duplicated", () => {
    const plan = planMatrixSync(
      [cell({ grade: "PE80", kg_per_m: 1.5 })],
      [],
      GRADES,
      [prod()],
      "DWC Pipe",
    );
    expect(plan.insert).toHaveLength(0);
    expect(plan.update).toEqual([
      expect.objectContaining({ id: "p1", weight_kg: 1.5, size_mm: 110 }),
    ]);
  });

  it("an edited row size updates its products through the previous key", () => {
    const plan = planMatrixSync(
      [cell({ grade: "PE80", size_mm: 111, size_label: "DN 111" })],
      [cell({ grade: "PE80" })],
      GRADES,
      [prod()],
      "DWC Pipe",
    );
    expect(plan.insert).toHaveLength(0);
    expect(plan.update).toEqual([expect.objectContaining({ id: "p1", size_mm: 111 })]);
  });

  it("a cleared cell (0 kg) deactivates its product, never deletes", () => {
    const plan = planMatrixSync(
      [cell({ grade: "PE80", kg_per_m: 0 })],
      [],
      GRADES,
      [prod()],
      "DWC Pipe",
    );
    expect(plan.deactivate).toEqual(["p1"]);
    expect(plan.update).toHaveLength(0);
  });

  it("a removed cell deactivates its products", () => {
    const plan = planMatrixSync([], [cell({ grade: "PE80" })], GRADES, [prod()], "DWC Pipe");
    expect(plan.deactivate).toEqual(["p1"]);
  });

  it("adopts a hand-made product whose class is written differently", () => {
    const plan = planMatrixSync(
      [cell({ grade: "PE80" })],
      [],
      GRADES,
      [prod({ id: "hand", pn: "sn8" })],
      "DWC Pipe",
    );
    expect(plan.insert).toHaveLength(0);
    expect(plan.update[0]?.id).toBe("hand");
  });
});

describe("weight matrix edge cases", () => {
  it("a row removed and added back keeps its product active", () => {
    const plan = planMatrixSync(
      [cell({ id: "new", grade: "PE80" })],
      [cell({ id: "old", grade: "PE80" })],
      GRADES,
      [prod()],
      "DWC Pipe",
    );
    expect(plan.update.map((u) => u.id)).toEqual(["p1"]);
    expect(plan.deactivate).toEqual([]);
  });
  it("an ungraded subcategory gets one product per cell on its own rate group", () => {
    const plan = planMatrixSync([cell({ category_id: "acc" })], [], [], [], "Accessory");
    expect(plan.insert).toHaveLength(1);
    expect(plan.insert[0]).toMatchObject({ rate_group_id: "acc", grade: null });
  });
});
