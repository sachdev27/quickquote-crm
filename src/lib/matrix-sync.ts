// Turns a subcategory's weight matrix (size x class → kg/m) into catalog products. Products are matched to a cell
// by (category, grade, size, class); quotes reference products, so cleared cells deactivate, never delete.

export interface MatrixCell {
  id: string;
  category_id: string;
  grade: string | null; // null = same weight for every grade of the subcategory
  size_mm: number;
  size_label: string;
  class: string;
  kg_per_m: number;
  od_mm: number | null;
  id_mm: number | null;
  wall_mm: number | null;
}

interface ExistingProduct {
  id: string;
  category: string;
  grade: string | null;
  size_mm: number | null;
  pn: string | null;
  active: number;
  weight_kg: number;
}

export interface NewProduct {
  category: string;
  rate_group_id: string;
  name: string;
  grade: string;
  size_mm: number;
  pn: string;
  unit: "m";
  weight_kg: number;
}

export interface SyncPlan {
  insert: NewProduct[];
  update: { id: string; weight_kg: number; size_mm: number; pn: string; name: string; active: 1 }[];
  deactivate: string[];
}

const normClass = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/\s+/g, "");
const key = (category: string, grade: string, size: number, cls: string) =>
  `${category}|${grade}|${Math.round(size)}|${normClass(cls)}`;
const gradesOf = (c: MatrixCell, grades: string[]) => (c.grade ? [c.grade] : grades);

export function planMatrixSync(
  cells: MatrixCell[],
  prevCells: MatrixCell[],
  grades: string[],
  products: ExistingProduct[],
  label: string,
): SyncPlan {
  const byKey = new Map<string, ExistingProduct>();
  for (const p of products)
    if (p.size_mm != null) byKey.set(key(p.category, p.grade ?? "", p.size_mm, p.pn ?? ""), p);
  const prevById = new Map(prevCells.map((c) => [c.id, c]));
  const plan: SyncPlan = { insert: [], update: [], deactivate: [] };
  const off = (p: ExistingProduct | undefined) => {
    if (p && p.active && !plan.deactivate.includes(p.id)) plan.deactivate.push(p.id);
  };

  for (const c of cells) {
    const prev = prevById.get(c.id);
    for (const g of gradesOf(c, grades)) {
      const found =
        (prev && byKey.get(key(prev.category_id, g, prev.size_mm, prev.class))) ??
        byKey.get(key(c.category_id, g, c.size_mm, c.class));
      if (!(c.kg_per_m > 0)) {
        off(found);
        continue;
      }
      const name = `${label} ${g} ${c.size_label} ${c.class}`.replace(/\s+/g, " ").trim();
      const size = Math.round(c.size_mm);
      if (found)
        plan.update.push({
          id: found.id,
          weight_kg: c.kg_per_m,
          size_mm: size,
          pn: c.class,
          name,
          active: 1,
        });
      else
        plan.insert.push({
          category: c.category_id,
          rate_group_id: `${c.category_id}:${g}`,
          name,
          grade: g,
          size_mm: size,
          pn: c.class,
          unit: "m",
          weight_kg: c.kg_per_m,
        });
    }
  }
  // cells removed from the matrix
  const kept = new Set(cells.map((c) => c.id));
  for (const prev of prevCells)
    if (!kept.has(prev.id))
      for (const g of gradesOf(prev, grades))
        off(byKey.get(key(prev.category_id, g, prev.size_mm, prev.class)));
  return plan;
}
