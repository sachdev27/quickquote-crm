import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/bottom-nav";
import { Card, Chips, Field, inputCls } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { CATEGORY_LABELS, GST_OPTIONS, UNIT_LABELS, type Category, type Unit } from "@/lib/quote";
import { getPriceList, listPriceLists, savePriceList, saveProduct, setPrice } from "@/data/api";
import { recall, remember } from "@/lib/utils";
import { LAST_LIST, sectionOf, shortName } from "@/lib/catalog";

export const Route = createFileRoute("/_authenticated/prices")({
  head: () => ({ meta: [{ title: "Price lists — Tarko CRM" }] }),
  component: PricesPage,
});

type Item = Awaited<ReturnType<typeof getPriceList>>["items"][number];

function PricesPage() {
  const qc = useQueryClient();
  const lists = useQuery({ queryKey: ["price-lists"], queryFn: () => listPriceLists(), staleTime: 60_000 });
  const [listId, setListId] = useState("");
  const [cat, setCat] = useState<"all" | Category>("all");
  const [q, setQ] = useState("");
  const [editList, setEditList] = useState<null | { id?: string; name: string; wef: string; inclusive: boolean; copyFrom: string }>(null);
  const [editProduct, setEditProduct] = useState<null | Partial<Item>>(null);

  useEffect(() => {
    if (!lists.data?.length || listId) return;
    const last = recall(LAST_LIST);
    setListId(lists.data.find((l) => l.id === last)?.id ?? lists.data[0]?.id ?? "");
  }, [lists.data, listId]);

  const list = useQuery({ queryKey: ["price-list", listId], queryFn: () => getPriceList({ data: { id: listId } }), enabled: !!listId, staleTime: 60_000 });

  const sections = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const p of list.data?.items ?? []) {
      if (cat !== "all" && p.category !== cat) continue;
      if (q && !`${p.name} ${p.size_mm ?? ""}`.toLowerCase().includes(q.toLowerCase())) continue;
      const k = sectionOf(p);
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()];
  }, [list.data, cat, q]);

  async function savePrice(p: Item, value: string) {
    const price = value.trim() === "" ? null : Number(value);
    if (price !== null && (!isFinite(price) || price < 0)) return void toast.error("Invalid price");
    if (price === p.price) return;
    try {
      await setPrice({ data: { listId, productId: p.id, price } });
      qc.setQueryData(["price-list", listId], (old: typeof list.data) =>
        old && { ...old, items: old.items.map((x) => (x.id === p.id ? { ...x, price } : x)) }
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function submitList(e: React.FormEvent) {
    e.preventDefault();
    if (!editList) return;
    try {
      const { id } = await savePriceList({
        data: {
          ...(editList.id ? { id: editList.id } : {}),
          name: editList.name,
          wef: editList.wef,
          prices_include_gst: editList.inclusive,
          ...(editList.copyFrom ? { copyFrom: editList.copyFrom } : {}),
        },
      });
      await qc.invalidateQueries({ queryKey: ["price-lists"] });
      await qc.invalidateQueries({ queryKey: ["price-list", id] });
      setListId(id);
      remember(LAST_LIST, id);
      setEditList(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  async function submitProduct(e: React.FormEvent) {
    e.preventDefault();
    const p = editProduct;
    if (!p?.name?.trim()) return void toast.error("Name is required");
    try {
      await saveProduct({
        data: {
          ...(p.id ? { id: p.id } : {}),
          category: (p.category ?? "fitting") as Category,
          name: p.name,
          grade: p.grade ?? null, pn: p.pn ?? null, inch: p.inch ?? null, roll_lengths: p.roll_lengths ?? null, hsn: p.hsn ?? null,
          size_mm: p.size_mm ?? null,
          unit: (p.unit ?? "pc") as Unit,
          gst_rate: p.gst_rate ?? 18,
          active: true,
        },
      });
      await qc.invalidateQueries({ queryKey: ["price-list"] });
      setEditProduct(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  const cur = list.data?.list;

  return (
    <PageShell title="Price lists">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Chips
              label="Price list"
              value={listId}
              onChange={(id) => { setListId(id); remember(LAST_LIST, id); }}
              options={(lists.data ?? []).map((l) => ({ value: l.id, label: l.name, ...(l.wef ? { sub: `w.e.f. ${l.wef}` } : {}) }))}
            />
          </div>
          <Button variant="outline" className="h-12 shrink-0 rounded-xl" aria-label="New price list"
            onClick={() => setEditList({ name: "", wef: new Date().toISOString().slice(0, 10), inclusive: cur ? !!cur.prices_include_gst : true, copyFrom: listId })}>
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        {cur && (
          <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
            <div>
              <p className="font-semibold">{cur.name}</p>
              <p className="text-sm text-muted-foreground">{cur.prices_include_gst ? "Prices include GST" : "GST extra on prices"}{cur.wef ? ` · w.e.f. ${cur.wef}` : ""}</p>
            </div>
            <Button variant="ghost" className="h-11 rounded-xl" aria-label="Edit price list"
              onClick={() => setEditList({ id: cur.id, name: cur.name, wef: cur.wef ?? "", inclusive: !!cur.prices_include_gst, copyFrom: "" })}>
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        )}

        <input placeholder="Search size or name" value={q} onChange={(e) => setQ(e.target.value)} className={inputCls} />
        <Chips label="Category" value={cat} onChange={setCat}
          options={[{ value: "all" as const, label: "All" }, ...(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))]} />

        {list.isLoading && <div className="h-64 animate-pulse rounded-2xl bg-secondary" />}
        {sections.map(([title, items]) => (
          <Card key={title} title={title}>
            <ul className="-my-1 divide-y divide-border/60">
              {items.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditProduct(p)}>
                    <p className="truncate font-medium tabular-nums">{shortName(p)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      ₹/{UNIT_LABELS[p.unit as Unit]} · GST {p.gst_rate}%{p.roll_lengths ? ` · ${p.roll_lengths} m roll` : ""}
                    </p>
                  </button>
                  <PriceCell key={`${listId}-${p.id}`} value={p.price} onSave={(v) => savePrice(p, v)} />
                </li>
              ))}
            </ul>
          </Card>
        ))}

        <Button variant="outline" className="h-12 w-full rounded-xl border-dashed text-base"
          onClick={() => setEditProduct({ category: "fitting", unit: "pc", gst_rate: 18, hsn: "3917 40 00" })}>
          <Plus className="mr-1 h-5 w-5" /> Add product
        </Button>
      </div>

      <Drawer open={!!editList} onOpenChange={(o) => !o && setEditList(null)}>
        <DrawerContent>
          <DrawerHeader className="text-left"><DrawerTitle>{editList?.id ? "Edit price list" : "New price list"}</DrawerTitle></DrawerHeader>
          {editList && (
            <form onSubmit={submitList} className="space-y-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Field label="Name"><input value={editList.name} onChange={(e) => setEditList({ ...editList, name: e.target.value })} placeholder="e.g. Dealer list, Retail, Project" className={inputCls} /></Field>
              <Field label="With effect from"><input type="date" value={editList.wef} onChange={(e) => setEditList({ ...editList, wef: e.target.value })} className={inputCls} /></Field>
              <label className="flex items-center justify-between rounded-xl border border-border p-3">
                <span className="font-medium">Prices include GST</span>
                <Switch checked={editList.inclusive} onCheckedChange={(v) => setEditList({ ...editList, inclusive: v })} />
              </label>
              {!editList.id && (
                <Field label="Start with prices from">
                  <select className={inputCls} value={editList.copyFrom} onChange={(e) => setEditList({ ...editList, copyFrom: e.target.value })}>
                    <option value="">Empty list</option>
                    {lists.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </Field>
              )}
              <Button type="submit" className="h-12 w-full rounded-xl text-base font-semibold">Save</Button>
            </form>
          )}
        </DrawerContent>
      </Drawer>

      <Drawer open={!!editProduct} onOpenChange={(o) => !o && setEditProduct(null)}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left"><DrawerTitle>{editProduct?.id ? "Edit product" : "New product"}</DrawerTitle></DrawerHeader>
          {editProduct && (
            <form onSubmit={submitProduct} className="flex min-h-0 flex-col">
              <div className="space-y-4 overflow-y-auto px-4 pb-4">
                <Chips<Category> label="Category" value={(editProduct.category ?? "fitting") as Category}
                  onChange={(c) => setEditProduct({ ...editProduct, category: c, gst_rate: c === "sprinkler" ? 5 : 18 })}
                  options={(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} />
                <Field label="Name (as printed on quote)"><input value={editProduct.name ?? ""} onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })} placeholder="e.g. 110 mm Elbow 90°" className={inputCls} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Size (mm)"><input inputMode="numeric" value={editProduct.size_mm ?? ""} onChange={(e) => setEditProduct({ ...editProduct, size_mm: e.target.value ? Number(e.target.value) : null })} className={inputCls} /></Field>
                  <Field label="Grade"><input value={editProduct.grade ?? ""} onChange={(e) => setEditProduct({ ...editProduct, grade: e.target.value })} placeholder="PE63" className={inputCls} /></Field>
                  <Field label="PN"><input value={editProduct.pn ?? ""} onChange={(e) => setEditProduct({ ...editProduct, pn: e.target.value })} placeholder="PN 6" className={inputCls} /></Field>
                  <Field label="HSN"><input value={editProduct.hsn ?? ""} onChange={(e) => setEditProduct({ ...editProduct, hsn: e.target.value })} className={inputCls} /></Field>
                </div>
                <Field label="Priced per">
                  <Chips<Unit> label="Unit" value={(editProduct.unit ?? "pc") as Unit} onChange={(u) => setEditProduct({ ...editProduct, unit: u })}
                    options={[{ value: "m", label: "Metre" }, { value: "pc", label: "Piece" }, { value: "kg", label: "Kg" }]} />
                </Field>
                <Field label="GST">
                  <Chips label="GST" value={editProduct.gst_rate ?? 18} onChange={(g) => setEditProduct({ ...editProduct, gst_rate: g })} options={GST_OPTIONS.map((g) => ({ value: g, label: `${g}%` }))} />
                </Field>
                <p className="text-xs text-muted-foreground">Set the price for each list on the Price lists screen.</p>
              </div>
              <div className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Button type="submit" className="h-12 w-full rounded-xl text-base font-semibold">Save product</Button>
              </div>
            </form>
          )}
        </DrawerContent>
      </Drawer>
    </PageShell>
  );
}

// Edits in place; saves on blur/Enter. Empty = product not sold in this list.
function PriceCell({ value, onSave }: { value: number | null; onSave: (v: string) => Promise<void> }) {
  const [v, setV] = useState(value == null ? "" : String(value));
  const [saved, setSaved] = useState(false);
  const commit = async () => {
    if (v === (value == null ? "" : String(value))) return;
    await onSave(v);
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };
  return (
    <div className="relative w-28 shrink-0">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
      <input
        aria-label="Price"
        inputMode="decimal"
        value={v}
        placeholder="—"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={`${inputCls} h-11 pl-7 pr-7 text-right font-semibold`}
      />
      {saved && <Check className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />}
    </div>
  );
}
