import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { ProductFields } from "@/components/product-fields";
import {
  duplicateForm,
  focusProductName,
  productPayload,
  productToForm,
  type Product,
  type ProductForm,
} from "@/lib/product-form";
import { saveProduct } from "@/data/api";
import { useQueryClient } from "@tanstack/react-query";
import type { Category, Rate, Unit } from "@/lib/quote";

export function ProductDialog({
  open,
  onOpenChange,
  product,
  initialCategory = "fitting",
  groups,
  brands,
  basis,
  rateOf,
  sprinklerRate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | ProductForm | null;
  initialCategory?: Category;
  groups: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  basis: string;
  rateOf: (group: string, weightKg?: number, brandId?: string | null) => number;
  sprinklerRate: (brandId?: string | null) => Rate | undefined;
  onSaved?: (savedProduct: ProductForm, id: string) => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState<ProductForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (product) {
        setF(
          "weight_kg" in product
            ? productToForm(product as Product)
            : { ...(product as ProductForm) },
        );
      } else {
        setF({
          category: initialCategory,
          rate_group_id: groups[0]?.id ?? "",
          name: "",
          unit: initialCategory === "pipe" ? ("m" as Unit) : ("pc" as Unit),
          weight: "",
          gst_rate: initialCategory === "sprinkler" ? 5 : 18,
          active: 1,
        });
        focusProductName();
      }
    } else {
      setF(null);
    }
  }, [open, product, initialCategory, groups]);

  if (!open || !f) return null;

  const isEdit = !!f.id;

  const duplicate = () => {
    setF(duplicateForm(f));
    focusProductName();
    toast.message("Duplicated product: modify and save as new");
  };

  async function remove() {
    if (!f?.id) return;
    if (!confirm(`Delete product "${f.name}" from catalog?`)) return;
    setSaving(true);
    try {
      await saveProduct({ data: productPayload(f, false) });
      await qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product removed from catalog");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message.slice(0, 140) : "Could not delete");
    } finally {
      setSaving(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f?.name?.trim()) return void toast.error("Product name is required");
    if (!f.rate_group_id) return void toast.error("Pick a rate group");
    setSaving(true);
    try {
      const payload = productPayload(f, true);
      const res = await saveProduct({ data: payload });
      await qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(isEdit ? "Product updated" : "Product created & added to catalog");
      onSaved?.({ ...f, id: res.id }, res.id);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message.slice(0, 140) : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="flex items-center justify-between border-b border-border px-4 py-3 text-left">
          <DrawerTitle>{isEdit ? "Edit product" : "New product"}</DrawerTitle>
          {isEdit && (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs font-medium"
                onClick={duplicate}
                title="Duplicate this product"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Duplicate</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={remove}
                title="Remove product"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </DrawerHeader>
        <form onSubmit={save} className="@container flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 @2xl:grid @2xl:grid-cols-2 @2xl:items-start @2xl:gap-x-6 @2xl:gap-y-4 @2xl:space-y-0">
            <ProductFields
              prod={f}
              setProd={setF}
              groups={groups}
              brands={brands}
              basis={basis}
              rateOf={rateOf}
              sprinklerRate={sprinklerRate}
            />
          </div>
          <div className="flex gap-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="h-12 flex-1 rounded-xl text-base font-semibold"
            >
              {saving ? "Saving…" : isEdit ? "Save product changes" : "Create & add product"}
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
