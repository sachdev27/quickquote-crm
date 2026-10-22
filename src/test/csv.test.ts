import { describe, expect, it } from "vitest";
import { csvObjects, parseCsv, toCsv } from "@/lib/csv";

describe("csv", () => {
  it("round-trips quotes, commas and newlines", () => {
    const rows = [
      ["name", "note"],
      ['HDPE 25 mm (3/4")', "a, b\nc"],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it("maps headers case-insensitively and strips Excel BOM", () => {
    expect(csvObjects("﻿Size_MM,PN\r\n63,6\r\n")).toEqual([{ size_mm: "63", pn: "6" }]);
  });
});
