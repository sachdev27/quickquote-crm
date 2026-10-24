import type { listProducts } from "@/data/api";
import type { Category, Unit } from "@/lib/quote";

export type Product = Awaited<ReturnType<typeof listProducts>>[number];
// A product being edited: weight is kept as typed text.
export type ProductForm = Partial<Omit<Product, "weight_kg">> & { weight: string };

const n = (s: string) => Number(s) || 0;

export const productToForm = (p: Product): ProductForm => ({ ...p, weight: String(p.weight_kg) });

// Same details as a new, unsaved product, named "… (copy)" for retyping.
export function duplicateForm(p: ProductForm): ProductForm {
  const { id: _id, ...rest } = p;
  return { ...rest, name: `${p.name ?? ""} (copy)` };
}

// What saveProduct takes for this form.
export const productPayload = (p: ProductForm, active = true) => ({
  ...(p.id ? { id: p.id } : {}),
  category: (p.category ?? "fitting") as Category,
  rate_group_id: p.rate_group_id ?? "",
  name: p.name ?? "",
  grade: p.grade ?? null,
  roll: p.roll ?? null,
  pn: p.pn ?? null,
  inch: p.inch ?? null,
  roll_lengths: p.roll_lengths ?? null,
  hsn: p.hsn ?? null,
  size_mm: p.size_mm ?? null,
  brand_id: p.category === "sprinkler" ? (p.brand_id ?? null) : null,
  length_m: p.category === "sprinkler" ? (p.length_m ?? null) : null,
  unit: (p.unit ?? "pc") as Unit,
  weight_kg: n(p.weight),
  gst_rate: p.gst_rate ?? 18,
  active,
});

// Focus and select the name field (after a sheet's open animation).
export const focusProductName = () =>
  setTimeout(() => {
    const el = document.getElementById("product-name") as HTMLInputElement | null;
    el?.focus();
    el?.select();
  }, 350);
