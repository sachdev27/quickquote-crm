import { beforeEach, describe, expect, it } from "vitest";
import { ratePerKg, registerCategories, sprinklerRateKg, type Rate } from "@/lib/quote";
import {
  categoryOfGroup,
  fixedPrice,
  groupIdFor,
  isPieceGroup,
  rateKgFor,
  unitPriceFor,
} from "@/lib/pricing";

const cat = (
  id: string,
  grades: string,
  price_method: string,
  weight_method: string,
  drawing: string,
) => ({
  id,
  label: id,
  unit: "m",
  gst_rate: 18,
  rate_group_id: null,
  spec_fields: null,
  parent_id: "hdpe",
  grades,
  price_method,
  weight_method,
  drawing,
  class_label: "",
});

beforeEach(() =>
  registerCategories([
    cat("pipe", "PE63,PE80,PE100", "weight_rate", "is4984", "pipe"),
    cat("sprinkler", "PE63,PE80", "sprinkler_piece", "brand", "pipe"),
    cat("plb", "PE63,PE80,PE100", "weight_rate", "is4984", "pipe"),
    cat("dwc", "PE80,PE100", "weight_rate", "matrix", "dwc"),
    cat("fitting", "", "fixed", "none", "fitting"),
  ]),
);

const r: Rate = { raw_kg: 100, production_kg: 10, transport_kg: 5, margin: 10, margin_is_pct: 1 };

describe("rate group ids", () => {
  it("joins category and allowed grade", () => {
    expect(groupIdFor("pipe", "PE80")).toBe("pipe:PE80");
  });
  it("falls back to the category for missing, unknown or ungraded grades", () => {
    expect(groupIdFor("pipe", null)).toBe("pipe");
    expect(groupIdFor("pipe", "PE999")).toBe("pipe");
    expect(groupIdFor("fitting", "Electrofusion")).toBe("fitting");
  });
  it("reads the category back, including legacy ids", () => {
    expect(categoryOfGroup("plb:PE63")).toBe("plb");
    expect(categoryOfGroup("SPRINKLER")).toBe("sprinkler");
    expect(categoryOfGroup("PE100")).toBe("pipe");
    expect(categoryOfGroup("FITTING")).toBe("fitting");
    expect(categoryOfGroup("PLB")).toBe("plb");
  });
  it("knows piece-priced groups from the category's price method", () => {
    expect(isPieceGroup("sprinkler:PE63")).toBe(true);
    expect(isPieceGroup("SPRINKLER")).toBe(true);
    expect(isPieceGroup("pipe:PE63")).toBe(false);
  });
});

describe("pricing by method", () => {
  it("weight_rate keeps the old per-kg rate", () => {
    expect(rateKgFor(r, "pipe:PE80", 0.5)).toBe(ratePerKg(r));
  });
  it("sprinkler_piece keeps the old sprinkler rate", () => {
    expect(rateKgFor(r, "sprinkler:PE63", 2)).toBe(sprinklerRateKg(r, 2));
  });
  it("fixed price adds the preset margin as % or flat ₹", () => {
    expect(fixedPrice({ ...r, margin: 20, margin_is_pct: 1 }, 100)).toBe(120);
    expect(fixedPrice({ ...r, margin: 15, margin_is_pct: 0 }, 100)).toBe(115);
  });
  it("unit price picks the method from the group", () => {
    const r20 = { ...r, margin: 20, margin_is_pct: 1 };
    expect(unitPriceFor({ rate_group_id: "fitting", weight_kg: 0, base_price: 100 }, r20)).toBe(
      120,
    );
    expect(
      unitPriceFor({ rate_group_id: "pipe:PE80", weight_kg: 0.5, base_price: null }, r),
    ).toBeCloseTo(0.5 * ratePerKg(r));
    expect(
      unitPriceFor({ rate_group_id: "pipe:PE80", weight_kg: 0.5, base_price: null }, undefined),
    ).toBe(0);
  });
});
