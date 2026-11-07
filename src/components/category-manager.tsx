import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FolderPlus, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { RatesGrid } from "@/components/rates-grid";
import { WeightMatrix } from "@/components/weight-matrix";
import {
  deleteCategory,
  deleteProductGroup,
  listCategories,
  listPricing,
  listProducts,
  saveCategory,
  saveProductGroup,
} from "@/data/api";
import {
  GST_OPTIONS,
  type Drawing,
  type PriceMethod,
  type Unit,
  type WeightMethod,
} from "@/lib/quote";
import { cn } from "@/lib/utils";

type Data = Awaited<ReturnType<typeof listCategories>>;
type Cat = Data["categories"][number];
type Group = Data["groups"][number];

const field =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
const lbl = "mb-1 block text-xs font-medium text-muted-foreground";
const NEW = "__new";
const STD_GRADES = ["PE63", "PE80", "PE100"];

const PRICE_METHODS: { value: PriceMethod; label: string }[] = [
  { value: "weight_rate", label: "Weight × ₹/kg" },
  { value: "sprinkler_piece", label: "Per piece (sprinkler)" },
  { value: "fixed", label: "Fixed base price + margin" },
];
const WEIGHT_METHODS: { value: WeightMethod; label: string }[] = [
  { value: "is4984", label: "IS 4984 formula (grade + PN)" },
  { value: "matrix", label: "Weight table (you enter kg/m)" },
  { value: "brand", label: "Per brand (sprinkler)" },
  { value: "none", label: "No weight" },
];
const DRAWINGS: { value: Drawing; label: string }[] = [
  { value: "pipe", label: "Pipe cross-section" },
  { value: "dwc", label: "DWC corrugated" },
  { value: "fitting", label: "Fitting" },
  { value: "none", label: "None" },
];

// Catalog tree (parent groups → subcategories) with each subcategory's settings and rates, plus an all-rates grid.
export function CategoryManager() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"catalog" | "rates">("catalog");
  const [sel, setSel] = useState<string>("");
  const [newParent, setNewParent] = useState("");
  const cats = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategories(),
    enabled: open,
  });
  const pricing = useQuery({ queryKey: ["pricing"], queryFn: () => listPricing(), enabled: open });
  const prods = useQuery({ queryKey: ["products"], queryFn: () => listProducts(), enabled: open });
  const list = cats.data?.categories ?? [];
  const groups = cats.data?.groups ?? [];
  const current = sel === NEW ? null : (list.find((c) => c.id === sel) ?? list[0] ?? null);
  const count = (id: string) => (prods.data ?? []).filter((p) => p.category === id).length;

  return (
    <>
      <Button
        variant="outline"
        className="h-10 rounded-xl"
        onClick={() => setOpen(true)}
        title="Catalog tree and pricing rates"
      >
        <Layers className="h-4 w-4 xl:mr-1" /> <span className="hidden xl:inline">Catalog</span>
      </Button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="h-[88vh] sm:max-w-6xl">
          <DrawerHeader className="flex flex-row items-center gap-4 border-b border-border py-3 pl-5 pr-12 text-left">
            <div className="mr-auto">
              <DrawerTitle>Catalog &amp; pricing</DrawerTitle>
            </div>
            <div className="flex rounded-lg bg-muted p-0.5 text-sm">
              {(["catalog", "rates"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "rounded-md px-3 py-1",
                    tab === t ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {t === "catalog" ? "Catalog" : "All rates"}
                </button>
              ))}
            </div>
          </DrawerHeader>
          {tab === "rates" ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {pricing.data ? (
                <RatesGrid cats={list} pricing={pricing.data} />
              ) : (
                <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
              )}
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[18rem_1fr]">
              <Tree
                groups={groups}
                cats={list}
                selected={sel === NEW ? NEW : current?.id}
                count={count}
                onSelect={setSel}
                onNew={(parent) => {
                  setNewParent(parent);
                  setSel(NEW);
                }}
              />
              <div className="min-h-0 overflow-y-auto p-5">
                {(current || sel === NEW) && pricing.data ? (
                  <Detail
                    key={current?.id ?? `${NEW}${newParent}`}
                    cat={current}
                    groups={groups}
                    defaultParent={newParent || groups[0]?.id || ""}
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
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}

function useRefresh() {
  const router = useRouter();
  const qc = useQueryClient();
  return () =>
    Promise.all([
      router.invalidate(), // category labels everywhere
      qc.invalidateQueries({ queryKey: ["categories"] }),
      qc.invalidateQueries({ queryKey: ["pricing"] }),
    ]);
}

function Tree({
  groups,
  cats,
  selected,
  count,
  onSelect,
  onNew,
}: {
  groups: Group[];
  cats: Cat[];
  selected: string | undefined;
  count: (id: string) => number;
  onSelect: (id: string) => void;
  onNew: (parent: string) => void;
}) {
  const refresh = useRefresh();
  const [renaming, setRenaming] = useState<{ id?: string; label: string } | null>(null);
  async function saveGroup() {
    if (!renaming?.label.trim()) return setRenaming(null);
    try {
      await saveProductGroup({ data: renaming });
      await refresh();
      setRenaming(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message.slice(0, 140) : "Could not save");
    }
  }
  async function removeGroup(g: Group) {
    if (!confirm(`Delete group "${g.label}"?`)) return;
    try {
      await deleteProductGroup({ data: { id: g.id } });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message.slice(0, 140) : "Could not delete");
    }
  }
  const nameInput = (
    <div className="flex items-center gap-1 px-2 py-1">
      <input
        autoFocus
        value={renaming?.label ?? ""}
        onChange={(e) => setRenaming({ ...renaming, label: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") void saveGroup();
          if (e.key === "Escape") setRenaming(null);
        }}
        className={field}
        placeholder="Group name"
      />
      <button
        onClick={() => void saveGroup()}
        className="rounded p-1.5 hover:bg-muted"
        aria-label="Save"
      >
        <Check className="h-4 w-4" />
      </button>
    </div>
  );
  return (
    <nav className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {groups.map((g) => {
          const kids = cats.filter((c) => c.parent_id === g.id);
          return (
            <section key={g.id} className="mb-2">
              {renaming?.id === g.id ? (
                nameInput
              ) : (
                <div className="group flex items-center gap-1 px-2 py-1">
                  <span className="mr-auto text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.label}
                  </span>
                  <button
                    onClick={() => setRenaming({ id: g.id, label: g.label })}
                    className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100"
                    aria-label={`Rename ${g.label}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {!kids.length && (
                    <button
                      onClick={() => void removeGroup(g)}
                      className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-destructive group-hover:opacity-100"
                      aria-label={`Delete ${g.label}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => onNew(g.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`New subcategory in ${g.label}`}
                    title="New subcategory"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <ul>
                {kids.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => onSelect(c.id)}
                      className={cn(
                        "w-full rounded-lg px-3 py-1.5 text-left",
                        selected === c.id
                          ? "bg-primary/10 ring-1 ring-primary/30"
                          : "hover:bg-muted/60",
                      )}
                    >
                      <span className="block truncate text-sm font-medium">{c.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.grades ? c.grades.replace(/,/g, " · ") : "No grades"} · {count(c.id)}{" "}
                        products
                      </span>
                    </button>
                  </li>
                ))}
                {!kids.length && (
                  <li className="px-3 py-1 text-xs text-muted-foreground/70">Empty</li>
                )}
              </ul>
            </section>
          );
        })}
        {renaming && !renaming.id && nameInput}
      </div>
      <div className="border-t border-border p-2">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => setRenaming({ label: "" })}
        >
          <FolderPlus className="h-4 w-4" /> New group
        </Button>
      </div>
    </nav>
  );
}

function Detail({
  cat,
  groups,
  defaultParent,
  pricing,
  products,
  onSaved,
  onDeleted,
}: {
  cat: Cat | null;
  groups: Group[];
  defaultParent: string;
  pricing: Awaited<ReturnType<typeof listPricing>>;
  products: number;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}) {
  const refresh = useRefresh();
  const [f, setF] = useState({
    label: cat?.label ?? "",
    parent_id: cat?.parent_id ?? defaultParent,
    unit: (cat?.unit as Unit) ?? "m",
    gst: String(cat?.gst_rate ?? 18),
    spec_fields: cat?.spec_fields ?? "",
    grades: (cat?.grades ?? "").split(",").filter(Boolean),
    price_method: (cat?.price_method as PriceMethod) ?? "weight_rate",
    weight_method: (cat?.weight_method as WeightMethod) ?? "matrix",
    drawing: (cat?.drawing as Drawing) ?? "pipe",
    class_label: cat?.class_label ?? "",
  });
  const [extraGrade, setExtraGrade] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const toggleGrade = (g: string) =>
    set({ grades: f.grades.includes(g) ? f.grades.filter((x) => x !== g) : [...f.grades, g] });
  const gradeOptions = [...new Set([...STD_GRADES, ...f.grades])];

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast.success(done);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message.slice(0, 160) : "Could not save");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!f.label.trim()) return void toast.error("Name is required");
    let id = cat?.id;
    const ok = await run(
      async () => {
        ({ id } = await saveCategory({
          data: {
            ...(cat ? { id: cat.id } : {}),
            label: f.label,
            parent_id: f.parent_id,
            unit: f.unit,
            gst_rate: Number(f.gst) || 0,
            spec_fields: f.spec_fields,
            grades: f.grades,
            price_method: f.price_method,
            weight_method: f.weight_method,
            drawing: f.drawing,
            class_label: f.class_label,
          },
        }));
      },
      cat ? "Saved" : "Subcategory created",
    );
    if (ok && id) onSaved(id);
  }
  async function remove() {
    if (!cat || !confirm(`Delete "${cat.label}" and its rates?`)) return;
    if (await run(() => deleteCategory({ data: { id: cat.id } }), "Deleted")) onDeleted();
  }
  const select = <T extends string>(
    label: string,
    value: T,
    options: { value: T; label: string }[],
    onChange: (v: T) => void,
  ) => (
    <label>
      <span className={lbl}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className={field}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h3 className="mr-auto text-lg font-semibold">{cat ? cat.label : "New subcategory"}</h3>
        {cat && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || products > 0}
            title={products > 0 ? `${products} products use it` : "Delete"}
            onClick={() => void remove()}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        )}
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          {cat ? "Save" : "Create"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <label>
          <span className={lbl}>Name</span>
          <input
            value={f.label}
            onChange={(e) => set({ label: e.target.value })}
            className={field}
          />
        </label>
        {select(
          "Group",
          f.parent_id,
          groups.map((g) => ({ value: g.id, label: g.label })),
          (v) => set({ parent_id: v }),
        )}
        {select<Unit>(
          "Sold per",
          f.unit,
          [
            { value: "m", label: "Metre" },
            { value: "pc", label: "Piece" },
            { value: "kg", label: "Kg" },
          ],
          (v) => set({ unit: v }),
        )}
        {select(
          "Default GST",
          f.gst,
          GST_OPTIONS.map((g) => ({ value: String(g), label: `${g}%` })),
          (v) => set({ gst: v }),
        )}
        {select("Price method", f.price_method, PRICE_METHODS, (v) => set({ price_method: v }))}
        {select("Weight from", f.weight_method, WEIGHT_METHODS, (v) => set({ weight_method: v }))}
        {select("Drawing on quote", f.drawing, DRAWINGS, (v) => set({ drawing: v }))}
        <label>
          <span className={lbl}>Class label (PN, SN, …)</span>
          <input
            value={f.class_label}
            onChange={(e) => set({ class_label: e.target.value.toUpperCase() })}
            className={field}
          />
        </label>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <span className={lbl}>Grades (each gets its own rate)</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {gradeOptions.map((g) => (
              <button
                key={g}
                onClick={() => toggleGrade(g)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  f.grades.includes(g)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted",
                )}
              >
                {g}
              </button>
            ))}
            <input
              value={extraGrade}
              onChange={(e) => setExtraGrade(e.target.value.toUpperCase().replace(/\s+/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && extraGrade) {
                  set({ grades: [...new Set([...f.grades, extraGrade])] });
                  setExtraGrade("");
                }
              }}
              placeholder="+ grade, Enter"
              className="h-7 w-28 rounded-full border border-dashed border-input bg-background px-3 text-xs outline-none"
            />
          </div>
        </div>
        <label>
          <span className={lbl}>Custom specifications (comma separated)</span>
          <input
            value={f.spec_fields}
            onChange={(e) => set({ spec_fields: e.target.value })}
            placeholder="Colour, Coil length (m)"
            className={field}
          />
        </label>
      </div>

      {cat && cat.weight_method === "matrix" && (
        <section>
          <h4 className="mb-2 text-sm font-semibold">Weights (kg per metre)</h4>
          <WeightMatrix categoryId={cat.id} classLabel={cat.class_label} />
        </section>
      )}
      {cat ? (
        <section>
          <h4 className="mb-2 text-sm font-semibold">Rates</h4>
          <RatesGrid cats={[cat]} pricing={pricing} />
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          Rates appear here after you create it: one per grade and preset, starting at zero.
        </p>
      )}
    </div>
  );
}
