import { unzipSync, strFromU8 } from "fflate";

export const MAX_TEXT_CHARS = 40_000;

// Office files are zips, so a small upload can inflate enormously. Limits are checked from the
// declared sizes before anything is decompressed, and while text is built, not after.
const MAX_ENTRY_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const MAX_SHEETS = 10;
const MAX_ROWS = 5000;
const MAX_COLS = 256;

function safeUnzip(bytes: Uint8Array, wanted: (name: string) => boolean) {
  let total = 0;
  return unzipSync(bytes, {
    filter: (f) => {
      if (!wanted(f.name)) return false;
      total += f.originalSize;
      if (f.originalSize > MAX_ENTRY_BYTES || total > MAX_TOTAL_BYTES)
        throw new Error("The file is too large once unpacked");
      return true;
    },
  });
}

// What a file turns into before it reaches the model: PDFs, photos and voice notes go straight to
// Gemini; Word, Excel and plain-text style files are read to text here (Gemini cannot open them).
export type FileKind = "inline" | "docx" | "xlsx" | "text";

const EXT: Record<string, { kind: FileKind; mime?: string }> = {
  pdf: { kind: "inline", mime: "application/pdf" },
  png: { kind: "inline", mime: "image/png" },
  jpg: { kind: "inline", mime: "image/jpeg" },
  jpeg: { kind: "inline", mime: "image/jpeg" },
  webp: { kind: "inline", mime: "image/webp" },
  heic: { kind: "inline", mime: "image/heic" },
  mp3: { kind: "inline", mime: "audio/mp3" },
  wav: { kind: "inline", mime: "audio/wav" },
  ogg: { kind: "inline", mime: "audio/ogg" },
  opus: { kind: "inline", mime: "audio/ogg" },
  m4a: { kind: "inline", mime: "audio/aac" },
  aac: { kind: "inline", mime: "audio/aac" },
  docx: { kind: "docx" },
  xlsx: { kind: "xlsx" },
  xlsm: { kind: "xlsx" },
  csv: { kind: "text" },
  tsv: { kind: "text" },
  txt: { kind: "text" },
  md: { kind: "text" },
  json: { kind: "text" },
  html: { kind: "text" },
  htm: { kind: "text" },
  eml: { kind: "text" },
};

export const ACCEPT_EXT = Object.keys(EXT)
  .map((e) => `.${e}`)
  .join(",");

const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export function classify(name: string, mime: string): { kind: FileKind; mime: string } | null {
  const e = EXT[ext(name)];
  if (e) return { kind: e.kind, mime: e.mime ?? mime };
  if (/^(image|audio)\//.test(mime) || mime === "application/pdf") return { kind: "inline", mime };
  if (mime.startsWith("text/")) return { kind: "text", mime };
  return null;
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, g: string) =>
    g[0] === "#"
      ? String.fromCodePoint(
          g[1]?.toLowerCase() === "x" ? parseInt(g.slice(2), 16) : Number(g.slice(1)),
        )
      : (entities[g.toLowerCase()] ?? ""),
  );

const textRuns = (xml: string) =>
  [...xml.matchAll(/<(?:w:)?t(?:\s[^>]*)?>([^<]*)<\/(?:w:)?t>/g)]
    .map((m) => decode(m[1] ?? ""))
    .join("");

export function docxToText(bytes: Uint8Array): string {
  const files = safeUnzip(bytes, (n) => n === "word/document.xml");
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("That does not look like a .docx file");
  return strFromU8(xml)
    .replace(/<\/w:tc>/g, "\t")
    .split(/<\/w:p>/)
    .map(textRuns)
    .filter((l) => l.trim())
    .join("\n");
}

const colIndex = (ref: string) =>
  [...(/^[A-Z]+/.exec(ref)?.[0] ?? "A")].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

export function xlsxToText(bytes: Uint8Array): string {
  const files = safeUnzip(
    bytes,
    (n) => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n),
  );
  const shared = [
    ...strFromU8(files["xl/sharedStrings.xml"] ?? new Uint8Array()).matchAll(
      /<si>([\s\S]*?)<\/si>/g,
    ),
  ].map((m) => textRuns(m[1] ?? ""));
  const sheets = Object.keys(files)
    .filter((n) => n.startsWith("xl/worksheets/"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .slice(0, MAX_SHEETS);
  if (!sheets.length) throw new Error("That does not look like an .xlsx file");
  return sheets
    .map((name, si) => {
      const rows: string[] = [];
      let chars = 0;
      for (const r of strFromU8(files[name]!).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells: string[] = [];
        for (const c of (r[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const attrs = c[1] ?? "";
          const body = c[2] ?? "";
          const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? "A1";
          const type = /\bt="(\w+)"/.exec(attrs)?.[1];
          const v = /<v>([^<]*)<\/v>/.exec(body)?.[1];
          const val =
            type === "s"
              ? (shared[Number(v)] ?? "")
              : type === "inlineStr"
                ? textRuns(body)
                : decode(v ?? "");
          const col = colIndex(ref);
          if (col < MAX_COLS) cells[col] = val;
        }
        const line = Array.from(cells, (x) => x ?? "")
          .join("\t")
          .trimEnd();
        if (line) rows.push(line);
        chars += line.length;
        if (rows.length >= MAX_ROWS || chars > MAX_TEXT_CHARS) break;
      }
      return `--- Sheet ${si + 1} ---\n${rows.join("\n")}`;
    })
    .join("\n\n");
}

export const htmlToText = (html: string) =>
  decode(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<\s*(br|\/p|\/div|\/tr|\/li|\/h\d)\s*\/?>/gi, "\n")
      .replace(/<\/t[dh]>/gi, "\t")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
