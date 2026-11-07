import { afterEach, describe, expect, it } from "vitest";
import { registerCategories } from "@/lib/quote";
import { colourOf, drawingOf, dwcSpec, pipeSpec } from "@/lib/pipe-spec";
import { colourHex } from "@/components/pipe-section";

const cat = (id: string, drawing: string, grades = "PE63,PE80,PE100") => ({
  id,
  label: id,
  unit: "m",
  gst_rate: 18,
  rate_group_id: null,
  spec_fields: "Colour",
  grades,
  drawing,
});
afterEach(() => registerCategories([]));

describe("drawing per subcategory", () => {
  it("follows the subcategory's drawing setting", () => {
    registerCategories([cat("plb", "pipe"), cat("dwc", "dwc", "PE80,PE100")]);
    expect(drawingOf("plb")).toBe("pipe");
    expect(drawingOf("dwc")).toBe("dwc");
  });
  it("keeps the built-in drawings when categories are not loaded", () => {
    registerCategories([]);
    expect(drawingOf("pipe")).toBe("pipe");
    expect(drawingOf("sprinkler")).toBe("pipe");
    expect(drawingOf("fitting")).toBe("fitting");
    expect(drawingOf("other")).toBe("none");
  });
  it("draws a PLB line as a pipe cross-section", () => {
    registerCategories([cat("plb", "pipe")]);
    expect(
      pipeSpec({
        category: "plb",
        description: "PLB Duct PE80 40 mm PN 6 (Colour: Orange)",
        unit: "m",
        weightKg: 0.3,
      }),
    ).toMatchObject({ od: 40, grade: "PE80", pn: "PN 6" });
  });
  it("reads the colour the quote title prints", () => {
    expect(colourOf("PLB Duct PE80 40 mm PN 6 (Colour: Orange, Coil length (m): 500)")).toBe(
      "Orange",
    );
    expect(colourOf("HDPE Pipe 40 mm")).toBeNull();
  });
  it("maps colour names to a wall fill", () => {
    expect(colourHex("Orange")).toBe("#f97316");
    expect(colourHex("teal-ish")).toBeNull();
  });
  it("reads DWC size and ring stiffness", () => {
    registerCategories([cat("dwc", "dwc", "PE80,PE100")]);
    expect(dwcSpec({ category: "dwc", description: "DWC Pipe PE80 DN 110 SN 8" })).toEqual({
      dn: 110,
      cls: "SN 8",
    });
    expect(dwcSpec({ category: "pipe", description: "HDPE 110 mm" })).toBeNull();
  });
});

describe("catalog sections", () => {
  it("graded subcategories group by subcategory and grade", async () => {
    const { sectionOf } = await import("@/lib/catalog");
    registerCategories([
      { ...cat("pipe", "pipe"), label: "HDPE Pipe" },
      { ...cat("fitting", "fitting", ""), label: "Fitting" },
    ]);
    const p = { name: "x", roll: null, size_mm: 63, pn: "PN 6", inch: null };
    expect(sectionOf({ ...p, category: "pipe", grade: "PE80" })).toBe("HDPE Pipe PE80");
    expect(sectionOf({ ...p, category: "fitting", grade: "Electrofusion" })).toBe(
      "Fitting · Electrofusion",
    );
    expect(sectionOf({ ...p, category: "pipe", grade: null })).toBe("HDPE Pipe");
  });
});

describe("quote title", () => {
  it("adds the grade of a graded subcategory when the name lacks it", async () => {
    const { quoteTitle } = await import("@/lib/catalog");
    registerCategories([{ ...cat("sprinkler", "pipe", "PE63,PE80"), label: "Sprinkler" }]);
    expect(
      quoteTitle({ category: "sprinkler", name: "75 mm × 6 m", pn: null, grade: "PE80" }),
    ).toBe("Sprinkler Pipe 75 mm × 6 m PE80");
    expect(
      quoteTitle({ category: "sprinkler", name: "Sprinkler PE63 75 mm", pn: null, grade: "PE63" }),
    ).toBe("Sprinkler PE63 75 mm");
  });
});
