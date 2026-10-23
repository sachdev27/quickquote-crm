import { describe, expect, it } from "vitest";
import { computeTotals, inWords, ratePerKg, withBrandRaw } from "@/lib/quote";
import { pipeKgPerM, sdrFor } from "@/lib/weights";
import { pipeSpec } from "@/lib/pipe-spec";
import { stateOf, validUntil } from "@/lib/quote-doc";

describe("rate formula", () => {
  it("₹/kg = (raw + production + transport) × (1 + margin%)", () => {
    expect(
      ratePerKg({ raw_kg: 105, production_kg: 15, transport_kg: 2, margin: 12, margin_is_pct: 1 }),
    ).toBeCloseTo(136.64);
  });
  it("Non-ISI uses its own raw material price when set, else falls back to ISI raw", () => {
    const r = {
      raw_kg: 110,
      raw_kg_non_isi: 95,
      production_kg: 15,
      transport_kg: 10,
      margin: 25,
      margin_is_pct: 1,
    };
    expect(ratePerKg(r)).toBeCloseTo(168.75);
    expect(ratePerKg(r, true)).toBeCloseTo(150);
    expect(ratePerKg({ ...r, raw_kg_non_isi: null }, true)).toBeCloseTo(168.75);
  });
  it("brand raw replaces preset raw; blank brand non-ISI falls back to preset non-ISI", () => {
    const r = {
      raw_kg: 110,
      raw_kg_non_isi: 95,
      production_kg: 15,
      transport_kg: 10,
      margin: 25,
      margin_is_pct: 1,
    };
    const b = withBrandRaw(r, { raw_kg: 100, raw_kg_non_isi: null });
    expect(ratePerKg(b)).toBeCloseTo(156.25);
    expect(ratePerKg(b, true)).toBeCloseTo(150);
    expect(withBrandRaw(r, undefined)).toBe(r);
  });
  it("flat ₹/kg margin adds straight on", () => {
    expect(
      ratePerKg({ raw_kg: 105, production_kg: 15, transport_kg: 2, margin: 10, margin_is_pct: 0 }),
    ).toBe(132);
  });
});

describe("IS 4984 weights", () => {
  it("maps grade + PN to SDR", () => {
    expect(sdrFor("PE63", 6)).toBe(13.6);
    expect(sdrFor("PE80", 6)).toBe(17);
    expect(sdrFor("PE100", 10)).toBe(13.6);
  });
  it("110 mm PE63 PN6 ≈ 2.46 kg/m", () => {
    expect(pipeKgPerM(110, 13.6)).toBeCloseTo(2.463, 2);
  });
});

describe("totals", () => {
  it("mixed 18% / 5%, IGST, extra taxed at the highest rate, rounded", () => {
    const t = computeTotals(
      [
        { qty: 100, unitPrice: 10, gstRate: 18, hsn: "3917" },
        { qty: 2, unitPrice: 50.3, gstRate: 5, hsn: "3917" },
      ],
      100,
      { inclusive: false, igst: true },
    );
    expect(t.taxable).toBeCloseTo(1200.6);
    expect(t.igst).toBeCloseTo(203.03);
    expect(t.total).toBe(1404);
  });
  it("amount in words, Indian system", () => {
    expect(inWords(367462)).toBe(
      "Three Lakh Sixty Seven Thousand Four Hundred Sixty Two Rupees Only",
    );
    expect(inWords(12500000)).toBe("One Crore Twenty Five Lakh Rupees Only");
  });
});

describe("pipe spec", () => {
  it("reads OD, grade, PN and the wall behind the quoted weight", () => {
    const s = pipeSpec({
      category: "pipe",
      description: 'HDPE Pipe PE63 110 mm (4") PN 6',
      unit: "m",
      weightKg: pipeKgPerM(110, 13.6),
    });
    expect(s).toMatchObject({ od: 110, grade: "PE63", pn: "PN 6", sdr: 13.6 });
    expect(s!.wall).toBeCloseTo(8.1, 1);
  });
  it("falls back to IS 4984 wall without a weight; OD only for sprinkler pieces", () => {
    expect(
      pipeSpec({ category: "pipe", description: "PE100 63 mm PN 10", unit: "m", weightKg: 0 }),
    ).toMatchObject({ od: 63, wall: 4.7, sdr: 13.6 });
    expect(
      pipeSpec({
        category: "sprinkler",
        description: "Sprinkler Pipe 75 mm × 3.2 kg",
        unit: "pc",
        weightKg: 3.2,
      }),
    ).toMatchObject({ od: 75, wall: null, sdr: null });
    expect(
      pipeSpec({ category: "fitting", description: "Elbow 63 mm", unit: "pc", weightKg: 0 }),
    ).toBeNull();
  });
});

describe("quotation particulars", () => {
  it("names the state from a GSTIN", () => {
    expect(stateOf("27ABCDE1234F1Z5")).toBe("Maharashtra (27)");
    expect(stateOf(null)).toBeNull();
  });
  it("reads validity days from the terms", () => {
    expect(
      validUntil("2026-10-28", [
        "Price ex-factory.",
        "Prices valid for 7 days from quotation date.",
      ]),
    ).toBe("2026-11-04");
    expect(validUntil("2026-10-28", ["Price ex-factory."])).toBeNull();
  });
});
