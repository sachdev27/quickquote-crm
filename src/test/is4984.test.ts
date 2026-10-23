import { describe, expect, it } from "vitest";
import { IS_ODS, IS_SDRS, isSpec } from "@/lib/is4984";

// Catches slips in the transcription: the minimum wall is OD ÷ SDR rounded up to 0.1 mm (at least 1.8),
// and every weight sits near π·(OD − e)·e·0.95 for the mean wall.
describe("IS 4984 table", () => {
  it("looks up a cell", () => {
    expect(isSpec(63, 13.6)).toEqual({ min: 4.7, max: 5.3, kgPerM: 0.886 });
    expect(isSpec(63, 41)).toBeNull();
    expect(isSpec(2000, 6)).toBeNull();
  });
  it("is self-consistent", () => {
    const bad: string[] = [];
    for (const od of IS_ODS)
      for (const sdr of IS_SDRS) {
        const s = isSpec(od, sdr);
        if (!s) continue;
        const min = Math.ceil((od / sdr) * 10 - 1e-6) / 10;
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
