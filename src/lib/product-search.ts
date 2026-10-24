import { matchesSearch } from "@/lib/catalog";
import { pnNumber } from "@/lib/weights";

interface Searchable {
  category: string;
  name: string;
  grade: string | null;
  size_mm: number | null;
  pn: string | null;
  hsn?: string | null;
  roll?: string | null;
}

// Advanced product search shared by the price extractor: "32 6 63" or "63 6 pe63 cut" = OD, PN, grade.
// Numbers are positional for pipes (1st = OD mm, 2nd = PN); words filter by name/grade/HSN.
export function productQueryFilter(query: string): (p: Searchable) => boolean {
  const toks = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return () => true;

  const nums = toks.filter((t) => /^\d+(\.\d+)?$/.test(t));
  // grade is "pe63", or a bare 3rd number: 63 / 80 / 100
  const grade = toks.find((t) => /^pe\d*$/.test(t)) ?? (nums[2] ? `pe${nums[2]}` : undefined);
  const pnWord = toks.find((t) => /^pn\d+(\.\d+)?$/.test(t));
  const roll = toks.some((t) => t.length > 1 && "cut".startsWith(t))
    ? "cut"
    : toks.some((t) => t.length > 1 && "roll".startsWith(t))
      ? "complete"
      : null;
  const text = toks.filter(
    (t) =>
      !nums.includes(t) &&
      t !== grade &&
      t !== nums[2] &&
      t !== pnWord &&
      !/^(cut|c|roll|r|complete|pn|mm)$/.test(t),
  );
  const pnNum = pnWord ? pnWord.slice(2) : nums[1];

  return (p) => {
    if (p.category === "pipe") {
      if (nums[0] && !String(p.size_mm ?? "").startsWith(nums[0])) return false;
      if (pnNum && !String(pnNumber(p.pn)).startsWith(pnNum)) return false;
      if (grade && !(p.grade ?? "").toLowerCase().startsWith(grade)) return false;
      if (roll && (p.roll ?? "complete") !== roll) return false;
      return text.every((t) => `${p.name} ${p.hsn ?? ""}`.toLowerCase().includes(t));
    }
    // sprinklers & fittings: every word, numbers included, in the name, family or HSN
    return matchesSearch(`${p.name} ${p.grade ?? ""} ${p.hsn ?? ""}`, toks.join(" "));
  };
}
