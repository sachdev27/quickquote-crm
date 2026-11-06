import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import {
  deleteCategory,
  listCategories,
  listPricing,
  listProducts,
  saveCategory,
  saveRate,
} from "@/data/api";
import { GST_OPTIONS, UNIT_LABELS, fmtMoney, ratePerKg, type Unit } from "@/lib/quote";
import { cn } from "@/lib/utils";

type Cat = Awaited<ReturnType<typeof listCategories>>[number];
type Pricing = Awaited<ReturnType<typeof listPricing>>;

const field =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
const lbl = "mb-1 block text-xs font-medium text-muted-foreground";
// These groups have their own screens: HDPE pipe is priced per grade, sprinkler per piece, fittings are typed on the quote.
const SHARED_GROUPS = ["PE63", "PE80", "PE100", "SPRINKLER", "FITTING"];
const NEW = "__new";

export function CategoryManager() {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string>("");
  const cats = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategories(),
    enabled: open,
  });
  const pricing = useQuery({ queryKey: ["pricing"], queryFn: () => listPricing(), enabled: open });
  const prods = useQuery({ queryKey: ["products"], queryFn: () => listProducts(), enabled: open });
  const list = cats.data ?? [];
  const current = list.find((c) => c.id === sel) ?? (sel === NEW ? null : list[0]);
  const count = (id: string) => (prods.data ?? []).filter((p) => p.category === id).length;

  return (
    <>
      <Button
        variant="outline"
        className="h-10 rounded-xl"
        onClick={() => setOpen(true)}
        title="Categories and their pricing rates"
      >
        <Layers className="h-4 w-4 xl:mr-1" /> <span className="hidden xl:inline">Categories</span>
      </Button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="h-[80vh] sm:max-w-5xl">
          <DrawerHeader className="border-b border-border px-5 py-3 text-left">
            <DrawerTitle>Categories &amp; pricing</DrawerTitle>
            <p className="text-xs text-muted-foreground">
              Each category has its own rate group. New products start with its unit, GST and rate
              group.
            </p>
          </DrawerHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[17rem_1fr]">
            <nav className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
              <ul className="min-h-0 flex-1 overflow-y-auto p-2">
                {list.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setSel(c.id)}
                      className={cn(
                        "w-full rounded-lg px-3 py-2 text-left",
                        current?.id === c.id
                          ? "bg-primary/10 ring-1 ring-primary/30"
                          : "hover:bg-muted/60",
                      )}
                    >
                      <span className="block truncate text-sm font-medium">{c.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {UNIT_LABELS[c.unit as Unit]} · GST {c.gst_rate}% · {count(c.id)} products
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border p-2">
                <Button
                  variant={sel === NEW ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => setSel(NEW)}
                >
                  <Plus className="h-4 w-4" /> New category
                </Button>
              </div>
            </nav>
            <div className="min-h-0 overflow-y-auto p-5">
              {(current || sel === NEW) && pricing.data ? (
                <Detail
                  key={current?.id ?? NEW}
                  cat={current ?? null}
                  pricing={pricing.data}
                  products={current ? count(current.id) : 0}
                  onSaved={(id) => setSel(id)}
                  onDeleted={() => setSel("")}
                />
              ) : (
                <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

type RateDraft = Record<
  string,
  { raw: string; prod: string; trans: string; margin: string; pct: boolean }
>;

function Detail({
  cat,
  pricing,
  products,
  onSaved,
  onDeleted,
}: {
  cat: Cat | null;
  pricing: Pricing;
  products: number;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [label, setLabel] = useState(cat?.label ?? "");
  const [unit, setUnit] = useState<Unit>((cat?.unit as Unit) ?? "m");
  const [gst, setGst] = useState(String(cat?.gst_rate ?? 18));
  const [specs, setSpecs] = useState(cat?.spec_fields ?? "");
  const [busy, setBusy] = useState(false);

  const group = cat?.rate_group_id ?? null;
  const own = !!group && !SHARED_GROUPS.includes(group);
  const rateRow = (presetId: string) =>
    pricing.rates.find(
      (r) =>
        r.profile_id === pricing.activeProfileId &&
        r.preset_id === presetId &&
        r.group_id === group,
    );
  const [rates, setRates] = useState<RateDraft>(() =>
    Object.fromEntries(
      pricing.presets.map((p) => {
        const r = rateRow(p.id);
        return [
          p.id,
          {
            raw: String(r?.raw_kg ?? 0),
            prod: String(r?.production_kg ?? 0),
            trans: String(r?.transport_kg ?? 0),
            margin: String(r?.margin ?? 0),
            pct: (r?.margin_is_pct ?? 1) === 1,
          },
        ];
      }),
    ),
  );
  const setRate = (id: string, p: Partial<RateDraft[string]>) =>
    setRates((x) => ({ ...x, [id]: { ...x[id]!, ...p } }));
  const n = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : 0);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      await Promise.all([
        router.invalidate(), // category labels everywhere
        qc.invalidateQueries({ queryKey: ["categories"] }),
        qc.invalidateQueries({ queryKey: ["pricing"] }),
      ]);
      toast.success(done);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message.slice(0, 140) : "Could not save");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!label.trim()) return void toast.error("Category name is required");
    let newId: string | undefined;
    const ok = await run(
      async () => {
        ({ id: newId } = await saveCategory({
          data: { id: cat?.id, label, unit, gst_rate: n(gst), spec_fields: specs },
        }));
        if (own)
          for (const p of pricing.presets) {
            const d = rates[p.id]!;
            const prev = rateRow(p.id);
            await saveRate({
              data: {
                profile_id: pricing.activeProfileId,
                preset_id: p.id,
                group_id: group!,
                raw_kg: n(d.raw),
                raw_kg_non_isi: prev?.raw_kg_non_isi ?? null,
                production_kg: n(d.prod),
                transport_kg: n(d.trans),
                margin: n(d.margin),
                margin_is_pct: d.pct,
              },
            });
          }
      },
      cat ? "Saved" : "Category and rate group created. Set its rates here.",
    );
    if (ok && newId) onSaved(newId);
  }

  async function remove() {
    if (!cat || !confirm(`Delete category "${cat.label}"${own ? " and its rate group" : ""}?`))
      return;
    if (await run(() => deleteCategory({ data: { id: cat.id } }), "Category deleted")) onDeleted();
  }

  const profile = pricing.profiles.find((p) => p.id === pricing.activeProfileId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold">{cat ? cat.label : "New category"}</h3>
        {cat && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy || products > 0}
            onClick={remove}
            title={products > 0 ? `${products} products use it` : "Delete category"}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        )}
      </div>

      <section className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem]">
        <label className="block">
          <span className={lbl}>Name</span>
          <input
            className={field}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. PLB Duct Pipe"
            autoFocus={!cat}
          />
        </label>
        <label className="block">
          <span className={lbl}>Sold per</span>
          <select className={field} value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {(Object.keys(UNIT_LABELS) as Unit[]).map((u) => (
              <option key={u} value={u}>
                {UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={lbl}>Default GST</span>
          <select className={field} value={gst} onChange={(e) => setGst(e.target.value)}>
            {GST_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}%
              </option>
            ))}
          </select>
        </label>
      </section>

      <label className="block">
        <span className={lbl}>Custom specifications (comma separated)</span>
        <input
          className={field}
          value={specs}
          onChange={(e) => setSpecs(e.target.value)}
          placeholder="e.g. Colour, Wall thickness (mm), Coil length (m)"
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          Each becomes a field on the product form and prints on the quote line.
        </span>
      </label>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pricing rate group{group ? ` · ${group}` : ""}
          </h4>
          {own && profile && <span className="text-xs text-muted-foreground">{profile.name}</span>}
        </div>
        {!cat ? (
          <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
            A rate group is created with the category. Its rates appear here after you add it.
          </p>
        ) : !own ? (
          <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
            {group === "FITTING"
              ? "Fittings are bought in: the price is typed on each quote."
              : "This category's rates are edited under Pricing (per grade or per piece)."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[40rem] text-sm tabular-nums">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Preset</th>
                  <th className="px-2 py-2 text-right font-medium">Raw ₹/kg</th>
                  <th className="px-2 py-2 text-right font-medium">Production</th>
                  <th className="px-2 py-2 text-right font-medium">Transport</th>
                  <th className="px-2 py-2 text-right font-medium">Margin</th>
                  <th className="px-2 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-right font-medium">Price ₹/kg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pricing.presets.map((p) => {
                  const d = rates[p.id]!;
                  const price = ratePerKg({
                    raw_kg: n(d.raw),
                    production_kg: n(d.prod),
                    transport_kg: n(d.trans),
                    margin: n(d.margin),
                    margin_is_pct: d.pct ? 1 : 0,
                  });
                  const cell = (k: "raw" | "prod" | "trans" | "margin") => (
                    <td className="px-2 py-1.5">
                      <input
                        inputMode="decimal"
                        className={cn(field, "text-right")}
                        value={d[k]}
                        onChange={(e) => setRate(p.id, { [k]: e.target.value })}
                      />
                    </td>
                  );
                  return (
                    <tr key={p.id}>
                      <td className="px-3 py-1.5 font-medium">{p.name}</td>
                      {cell("raw")}
                      {cell("prod")}
                      {cell("trans")}
                      {cell("margin")}
                      <td className="px-2 py-1.5">
                        <select
                          className={cn(field, "w-20")}
                          value={d.pct ? "pct" : "flat"}
                          onChange={(e) => setRate(p.id, { pct: e.target.value === "pct" })}
                        >
                          <option value="pct">%</option>
                          <option value="flat">₹/kg</option>
                        </select>
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold">{fmtMoney(price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <Button disabled={busy} onClick={save}>
          {busy ? "Saving…" : cat ? "Save changes" : "Create category"}
        </Button>
      </div>
    </div>
  );
}
