import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { classify, docxToText, htmlToText, xlsxToText } from "./files";

describe("classify", () => {
  it("routes by extension, even when the browser gives no mime", () => {
    expect(classify("list.xlsx", "")?.kind).toBe("xlsx");
    expect(classify("enq.DOCX", "")?.kind).toBe("docx");
    expect(classify("PTT-123.opus", "")).toEqual({ kind: "inline", mime: "audio/ogg" });
    expect(classify("a.exe", "application/octet-stream")).toBeNull();
  });
});

describe("office readers", () => {
  it("reads paragraphs from a docx", () => {
    const xml = `<w:document><w:body><w:p><w:r><w:t>Need 63 mm PN6</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">2 rolls &amp; 32 mm</w:t></w:r></w:p></w:body></w:document>`;
    const zip = zipSync({ "word/document.xml": strToU8(xml) });
    expect(docxToText(zip)).toBe("Need 63 mm PN6\n2 rolls & 32 mm");
  });
  it("reads shared strings and numbers from an xlsx", () => {
    const sst = `<sst><si><t>Item</t></si><si><t>Qty</t></si><si><t>63 mm PN6</t></si></sst>`;
    const sheet = `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>200</v></c></row></sheetData></worksheet>`;
    const zip = zipSync({
      "xl/sharedStrings.xml": strToU8(sst),
      "xl/worksheets/sheet1.xml": strToU8(sheet),
    });
    expect(xlsxToText(zip)).toBe("--- Sheet 1 ---\nItem\tQty\n63 mm PN6\t\t200");
  });
  it("strips html", () => {
    expect(htmlToText("<p>Hi</p><p>63 mm&nbsp;pn6<br>2 rolls</p><style>x{}</style>")).toContain(
      "2 rolls",
    );
  });
});
