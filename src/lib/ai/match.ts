import type { ExtractedItem } from "./inbound";
import { productQueryFilter } from "@/lib/product-search";
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
  const candidates = found.slice(0, 8);
  const status: MatchStatus =
    candidates.length === 0 ? "none" : candidates.length === 1 ? "matched" : "ambiguous";
  return { status, candidates };
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
  lines: { productId: string; qty: number }[];
}
