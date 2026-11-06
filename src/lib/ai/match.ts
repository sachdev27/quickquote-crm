import type { ExtractedItem } from "./inbound";
import { productQueryFilter } from "@/lib/product-search";
import { CATEGORY_LABELS } from "@/lib/quote";
import { pnNumber } from "@/lib/weights";

interface Matchable {
  id: string;
  category: string;
  name: string;
  grade: string | null;
  size_mm: number | null;
  pn: string | null;
  hsn?: string | null;
  roll?: string | null;
  unit: string;
  roll_lengths?: string | null;
}

export type MatchStatus = "matched" | "ambiguous" | "none";

// Catalog candidates for one extracted line. Pipes match exactly on OD + PN (+ grade when stated);
// anything else falls back to the same word search the quote quick-add uses.
export function matchItem<P extends Matchable>(
  item: ExtractedItem,
  products: P[],
): { status: MatchStatus; candidates: P[] } {
  let found: P[] = [];
  if (item.kind === "pipe" && item.od_mm && item.pn) {
    const grade = item.grade?.toUpperCase().replace(/\s/g, "");
    found = products.filter(
      (p) =>
        p.category === "pipe" &&
        p.size_mm === item.od_mm &&
        pnNumber(p.pn) === item.pn &&
        (!grade || (p.grade ?? "").toUpperCase() === grade),
    );
    // a full roll is what is normally quoted; cut rolls only when nothing else fits
    const complete = found.filter((p) => (p.roll ?? "complete") === "complete");
    if (complete.length) found = complete;
  } else if (item.raw.trim()) {
    found = products.filter(productQueryFilter(item.raw));
  }
  // Long free text rarely contains every word of a product name, so rank by how many words it shares.
  if (!found.length && item.raw.trim()) found = rankByWords(item.raw, item.od_mm, products);
  const candidates = found.slice(0, 8);
  const status: MatchStatus =
    candidates.length === 0 ? "none" : candidates.length === 1 ? "matched" : "ambiguous";
  return { status, candidates };
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]/g, "");
const STOP = new Set([
  "the",
  "for",
  "and",
  "with",
  "make",
  "any",
  "good",
  "quality",
  "mark",
  "isi",
  "mm",
]);

// Products sharing at least two words (name, grade, category) with the line, best first.
// A size equal to the line's OD counts double, so "50MM PLB duct" finds the 50 mm PLB products.
export function rankByWords<P extends Matchable>(
  raw: string,
  od: number | null,
  products: P[],
): P[] {
  const words = [
    ...new Set(
      raw
        .toLowerCase()
        .split(/[^a-z0-9.]+/)
        .filter((w) => (w.length >= 3 || /^\d+$/.test(w)) && !STOP.has(w)),
    ),
  ];
  return products
    .map((p) => {
      const hay = squash(`${p.name} ${p.grade ?? ""} ${CATEGORY_LABELS[p.category] ?? p.category}`);
      const hits = words.filter((w) => hay.includes(squash(w))).length;
      return { p, score: hits + (od && p.size_mm === od ? 2 : 0) };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}

// Quantity in the product's own unit (pipes are priced per metre): "2 rolls" = 2 × the first roll length.
export function quoteQty(item: ExtractedItem, p: Matchable): number {
  const q = item.qty ?? 1;
  if (item.unit === "rolls" && p.unit === "m") {
    const len = (p.roll_lengths ?? "").split("/").map(Number).find(Boolean);
    return q * (len ?? 100);
  }
  return q;
}

export function replyDraft(args: {
  customer: string | null;
  lines: { title: string; qty: number; unit: string }[];
  unmatched: string[];
}): string {
  const list = args.lines.map((l, i) => `${i + 1}. ${l.title}: ${l.qty} ${l.unit}`).join("\n");
  return [
    `Dear ${args.customer || "Sir/Madam"},`,
    "",
    "Thank you for your enquiry. Please find our quotation attached for:",
    list,
    ...(args.unmatched.length
      ? [
          "",
          "Could you please confirm the specification (size, pressure class, grade) for:",
          ...args.unmatched.map((u) => `- ${u}`),
        ]
      : []),
    "",
    "Rates are per unit, excluding GST. Kindly let us know if you would like any changes.",
    "",
    "Regards",
  ].join("\n");
}

// Hand-off from the AI page to the quote form, held in this tab only.
export const AI_DRAFT_KEY = "qq-ai-draft";
export interface AiDraft {
  customerName: string | null;
  notes: string | null;
  // productId null = a custom item typed on the AI page; description/unitPrice/gstRate override the catalog
  lines: {
    productId: string | null;
    qty: number;
    description?: string;
    unitPrice?: number;
    gstRate?: number;
    unit?: "m" | "pc" | "kg";
  }[];
  pdf?: boolean; // save the quote straight away and open the print/PDF dialog
}
