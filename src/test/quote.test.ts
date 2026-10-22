import { describe, expect, it } from "vitest";
import { computeTotals, inWords } from "@/lib/quote";

describe("quote math", () => {
  it("GST-inclusive price backs out taxable value", () => {
    const t = computeTotals([{ qty: 1, unitPrice: 118, gstRate: 18, hsn: "3917" }], 0, { inclusive: true, igst: false });
    expect(t.taxable).toBeCloseTo(100);
    expect(t.cgst).toBeCloseTo(9);
    expect(t.total).toBe(118);
  });
  it("mixed 18% / 5% exclusive, IGST, extra taxed at the highest rate, rounded", () => {
    const t = computeTotals(
      [
        { qty: 100, unitPrice: 10, gstRate: 18, hsn: "3917" },
        { qty: 2, unitPrice: 50.3, gstRate: 5, hsn: "3917" },
      ],
      100,
      { inclusive: false, igst: true }
    );
    expect(t.taxable).toBeCloseTo(1200.6);
    expect(t.igst).toBeCloseTo(180 + 5.03 + 18);
    expect(t.total).toBe(1404);
    expect(t.groups).toHaveLength(3);
  });
  it("amount in words, Indian system", () => {
    expect(inWords(367462)).toBe("Three Lakh Sixty Seven Thousand Four Hundred Sixty Two Rupees Only");
    expect(inWords(12500000)).toBe("One Crore Twenty Five Lakh Rupees Only");
  });
});
