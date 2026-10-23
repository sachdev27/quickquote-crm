import { describe, expect, it } from "vitest";
import { IS_ODS, IS_PN, IS_SDRS, isSpec } from "@/lib/is4984";
import { PE_DENSITY } from "@/lib/weights";

// Catches slips in the transcription: the minimum wall is OD ÷ SDR rounded up to 0.1 mm (at least 2.0 mm, Amendment 2),
// and every weight sits near π·(OD − e)·e·0.95 for the mean wall.
describe("IS 4984 table", () => {
  it("looks up a cell", () => {
    expect(isSpec(63, 13.6)).toEqual({ min: 4.7, max: 5.3, kgPerM: 0.886 });
    expect(isSpec(63, 41)).toBeNull();
    expect(isSpec(2000, 6)).toBeNull();
  });
  it("kg/m follows π·(OD − ē)·ē·ρ with ē the mean wall (ρ fitted to the factory chart)", () => {
    const off: string[] = [];
    for (const od of IS_ODS)
      for (const sdr of IS_SDRS) {
        const s = isSpec(od, sdr);
        if (!s) continue;
        const e = (s.min + s.max) / 2;
        const uw = (Math.PI * (od - e) * e * PE_DENSITY) / 1000;
        if (Math.abs(uw / s.kgPerM - 1) > 0.012)
          off.push(`${od}/SDR${sdr}: ${s.kgPerM} vs ${uw.toFixed(3)}`);
      }
    expect(off).toEqual([]);
  });
  it("keeps both editions: 2016 original vs Amendment 2", () => {
    expect(isSpec(16, 9, "orig")).toMatchObject({ min: 1.8, max: 2.1 });
    expect(isSpec(16, 9)).toMatchObject({ min: 2.0, max: 2.3 });
    expect(isSpec(2500, 41, "orig")).toBeNull();
    expect(isSpec(2500, 41)).not.toBeNull();
  });
  it("PN follows clause 3.18: 10 · 2σ/(SDR − 1) · 0.85, rounded down to the PN series", () => {
    const series = [2, 2.5, 3.2, 4, 5, 6, 8, 10, 12.5, 16, 20, 25];
    const sigma: Record<string, number> = { PE63: 5, PE80: 6.3, PE100: 8 };
    for (const [grade, pns] of Object.entries(IS_PN))
      pns.forEach((pn, i) => {
        if (pn == null) return;
        const bar = ((20 * sigma[grade]!) / (IS_SDRS[i]! - 1)) * 0.85;
        expect(Math.max(...series.filter((x) => x <= bar + 1e-9))).toBe(pn);
      });
  });
  it("is self-consistent", () => {
    const bad: string[] = [];
    for (const od of IS_ODS)
      for (const sdr of IS_SDRS) {
        const s = isSpec(od, sdr);
        if (!s) continue;
        const min = Math.max(2, Math.ceil((od / sdr) * 10 - 1e-6) / 10);
        const e = (s.min + s.max) / 2;
        const uw = (Math.PI * (od - e) * e * 0.95) / 1000;
        if (Math.abs(s.min - min) > 0.11 || s.max < s.min || Math.abs(uw / s.kgPerM - 1) > 0.045)
          bad.push(
            `${od}/SDR${sdr}: ${s.min}-${s.max} ${s.kgPerM} (expect ~${min}, ${uw.toFixed(3)})`,
          );
      }
    expect(bad).toEqual([]);
  });
});
