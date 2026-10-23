import { describe, expect, it } from "vitest";
import {
  computeTotals,
  inWords,
  ratePerKg,
  sprinklerPrice,
  sprinklerRateKg,
  withBrandRaw,
} from "@/lib/quote";
import { pipeKgPerM, sdrFor } from "@/lib/weights";
import { pipeSpec } from "@/lib/pipe-spec";
import { stateOf, validUntil } from "@/lib/quote-doc";
import { parseRoll, withRolls } from "@/lib/rolls";
import { fyOf, invoiceNoOf, todayIST } from "@/lib/invoice";
import {
  FITTING_LIST,
  fittingKey,
  fittingName,
  fittingSize,
  groupFittings,
  netPrice,
  pairSize,
  splitFittingName,
} from "@/lib/fitting";
import { describeChanges, type AuditSnap } from "@/lib/audit";
import { ageLabel, daysSince, hueOf, initialsOf, staleness } from "@/lib/board";

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
  it("110 mm PE63 PN6 is 2.667 kg/m from the IS chart", () => {
    expect(pipeKgPerM(110, 13.6)).toBe(2.667);
  });
});

describe("sprinkler price", () => {
  const r = { raw_kg: 70, production_kg: 100, transport_kg: 0, margin: 80, margin_is_pct: 0 };
  it("raw × weight + production + margin, per piece", () => {
    expect(sprinklerPrice(r, 3.2)).toBe(404); // 70 × 3.2 + 100 + 80
    expect(sprinklerPrice(r, 2.8)).toBe(376);
    expect(sprinklerRateKg(r, 3.2) * 3.2).toBeCloseTo(404);
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
  it("reads OD, grade, PN and the IS 4984 min–max wall", () => {
    const s = pipeSpec({
      category: "pipe",
      description: 'HDPE Pipe PE63 110 mm (4") PN 6',
      unit: "m",
      weightKg: pipeKgPerM(110, 13.6),
    });
    expect(s).toMatchObject({ od: 110, grade: "PE63", pn: "PN 6", sdr: 13.6 });
    expect(s).toMatchObject({ wall: 8.1, wallMax: 9.1 });
    expect(s!.id).toBeCloseTo(93.8, 1); // 110 − 2 × 8.1
  });
  it("takes the wall from IS 4984, not the weight; OD only for sprinkler pieces", () => {
    expect(
      pipeSpec({ category: "pipe", description: "PE100 63 mm PN 10", unit: "m", weightKg: 0.5 }),
    ).toMatchObject({ od: 63, wall: 4.7, wallMax: 5.3, id: 53.6, sdr: 13.6 });
    expect(
      pipeSpec({
        category: "sprinkler",
        description: "Sprinkler Pipe 75 mm × 3.2 kg",
        unit: "pc",
        weightKg: 3.2,
      }),
    ).toMatchObject({ od: 75, wall: null, id: null, sdr: null });
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

describe("roll layout in descriptions", () => {
  it("rewrites the roll suffix when quantity or roll length changes", () => {
    expect(withRolls('HDPE Pipe PE63 63 mm (2") PN 6 · 1 roll × 200 m', 900, 300)).toBe(
      'HDPE Pipe PE63 63 mm (2") PN 6 · 3 rolls × 300 m',
    );
    expect(withRolls("Pipe · 3 rolls × 300 m", 650, 300)).toBe("Pipe"); // part roll: metres only
    expect(withRolls("Pipe", 500, 0)).toBe("Pipe");
    expect(parseRoll("Pipe · 2 rolls × 450 m")).toEqual({ rolls: 2, len: 450 });
  });
});

describe("audit summary", () => {
  const line = {
    description: "HDPE Pipe PE63 63 mm PN 6 · 3 rolls × 300 m",
    unit: "m" as const,
    qty: 900,
    weightKg: 0.818,
    rateKg: 100,
    unitPrice: 81.8,
    gstRate: 18,
  };
  const snap = (over: Partial<AuditSnap> = {}): AuditSnap => ({
    customer: "Shree Ganesh",
    brand: "Tarko",
    igst: false,
    nonIsi: false,
    extra: 0,
    notes: null,
    terms: "Price ex-factory.",
    lines: [line],
    ...over,
  });
  it("is empty when nothing changed", () => {
    expect(describeChanges(snap(), snap())).toBe("");
  });
  it("lists only what changed, old → new", () => {
    const after = snap({
      extra: 2500,
      lines: [
        {
          ...line,
          qty: 1000,
          gstRate: 12,
          description: "HDPE Pipe PE63 63 mm PN 6 · 2 rolls × 500 m",
        },
      ],
    });
    const s = describeChanges(snap(), after);
    expect(s).toContain("qty 900 → 1,000 m");
    expect(s).toContain("rolls 3×300 m → 2×500 m");
    expect(s).toContain("GST 18 → 12%");
    expect(s).toContain("Freight ₹0 → ₹2,500");
    expect(s).toMatch(/Total ₹[\d,.]+ → ₹[\d,.]+$/);
    expect(s.length).toBeLessThan(400);
  });
  it("notes added and removed items", () => {
    expect(describeChanges(snap(), snap({ lines: [line, line] }))).toContain("Added");
    expect(describeChanges(snap({ lines: [line, line] }), snap())).toContain("Removed");
  });
});

describe("board helpers", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");
  it("ages a card in whole days", () => {
    expect(daysSince("2026-10-23T01:00:00Z", now)).toBe(0);
    expect(daysSince("2026-10-20T12:00:00Z", now)).toBe(3);
    expect(daysSince("2026-10-25", now)).toBe(0); // future dates never go negative
    expect(daysSince(null, now)).toBe(0);
    expect(ageLabel(0)).toBe("today");
    expect(ageLabel(12)).toBe("12d");
  });
  it("flags slow and stale deals", () => {
    expect([3, 7, 14].map(staleness)).toEqual(["fresh", "slow", "stale"]);
  });
  it("makes initials and a stable hue", () => {
    expect(initialsOf("Shree Ganesh Agro")).toBe("SG");
    expect(initialsOf("Ramesh")).toBe("RA");
    expect(initialsOf(null)).toBe("?");
    expect(hueOf("Ramesh")).toBe(hueOf("Ramesh"));
    expect(hueOf("Ramesh")).toBeLessThan(360);
  });
});

describe("invoice numbering", () => {
  it("uses the April-March financial year", () => {
    expect(fyOf("2026-10-23")).toBe("2627");
    expect(fyOf("2027-03-31")).toBe("2627");
    expect(fyOf("2027-04-01")).toBe("2728");
    expect(fyOf("2026-01-15")).toBe("2526");
  });
  it("builds a number within 16 characters", () => {
    expect(invoiceNoOf("TRK", "2026-10-23", 7)).toBe("TRK/2627/0007");
    expect(invoiceNoOf("ABCDEF", "2026-10-23", 12345).length).toBeLessThanOrEqual(17);
    expect(invoiceNoOf("ABCDEF", "2026-10-23", 1234).length).toBeLessThanOrEqual(16);
  });
  it("converts the clock to the Indian date", () => {
    expect(todayIST(Date.parse("2026-10-23T20:00:00Z"))).toBe("2026-10-24"); // 1:30 am IST next day
    expect(todayIST(Date.parse("2026-10-23T10:00:00Z"))).toBe("2026-10-23");
  });
});

describe("fitting entry", () => {
  it("formats sizes", () => {
    expect(fittingSize("63")).toBe("63 mm");
    expect(fittingSize("90x63")).toBe("90 × 63 mm");
    expect(fittingSize(" 110 X 75 ")).toBe("110 × 75 mm");
    expect(fittingSize('2" BSP')).toBe('2" BSP');
    expect(fittingSize("")).toBe("");
  });
  it("builds the item name; description is optional", () => {
    expect(fittingName("Elbow 90°", "63")).toBe("Elbow 90° 63 mm");
    expect(fittingName("Reducer", "90x63", "Spigot moulded")).toBe(
      "Reducer 90 × 63 mm · Spigot moulded",
    );
  });
  it("applies a list-price discount", () => {
    expect(netPrice(1000, 40)).toBe(600);
    expect(netPrice(333, 35)).toBe(216.45);
    expect(netPrice(500, 0)).toBe(500);
    expect(netPrice(500, 150)).toBe(0);
  });
});

describe("fitting list", () => {
  it("joins two sizes and has the sheet families", () => {
    expect(pairSize("90", "63")).toBe("90x63");
    expect(pairSize("63", "")).toBe("63");
    expect(fittingName("Reducer", pairSize("90", "63"), "Electrofusion")).toBe(
      "Reducer 90 × 63 mm · Electrofusion",
    );
    const keys = FITTING_LIST.map(fittingKey);
    expect(new Set(keys).size).toBe(keys.length); // no duplicates
    expect(new Set(FITTING_LIST.map((d) => d.family))).toEqual(
      new Set(["Electrofusion", "Spigot moulded", "Pipe fitting", "Butt-weld"]),
    );
    expect(
      FITTING_LIST.filter((d) => d.pair).every((d) => /Reducer|Reducing|Saddle/.test(d.product)),
    ).toBe(true);
  });
});

describe("fitting catalog groups", () => {
  it("splits names and groups by family and product", () => {
    expect(splitFittingName("Reducer 90 × 63 mm")).toEqual({ product: "Reducer", size: "90x63" });
    expect(splitFittingName("Coupler 63 mm")).toEqual({ product: "Coupler", size: "63" });
    expect(splitFittingName("Ball valve")).toEqual({ product: "Ball valve", size: "" });
    const g = groupFittings([
      { name: "Reducer 90 × 63 mm", grade: "Electrofusion", hsn: "3917 40 00", gst_rate: 18 },
      { name: "Reducer 110 × 63 mm", grade: "Electrofusion", hsn: "3917 40 00", gst_rate: 18 },
      { name: "Reducer 90 × 63 mm", grade: "Butt-weld", hsn: "3917 40 00", gst_rate: 18 },
      { name: "Coupler 63 mm", grade: "Electrofusion", hsn: "3917 40 00", gst_rate: 18 },
    ]);
    expect(g.map((x) => x.key)).toEqual([
      "Electrofusion|Reducer",
      "Butt-weld|Reducer",
      "Electrofusion|Coupler",
    ]);
    expect(g[0]).toMatchObject({ pair: true, sizes: ["90x63", "110x63"] });
    expect(g[2]).toMatchObject({ pair: false, sizes: ["63"] });
  });
});
