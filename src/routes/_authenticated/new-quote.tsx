import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/bottom-nav";
import { Card, Chips, Field, Stepper, inputCls } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { createQuote, getPriceList, listBrands, listCustomers, listPriceLists } from "@/data/api";
import { LAST_BRAND, LAST_LIST, shortName } from "@/lib/catalog";
import { CATEGORY_LABELS, GST_OPTIONS, UNIT_LABELS, computeTotals, fmtMoney, fmtNum, lineGross, type Category, type Line, type Unit } from "@/lib/quote";
import { recall, remember } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/new-quote")({
  head: () => ({ meta: [{ title: "New quote — Tarko CRM" }] }),
  component: NewQuote,
});

type Item = Awaited<ReturnType<typeof getPriceList>>["items"][number];
// priceEdited: a hand-typed price survives switching price lists; untouched lines re-price from the new list.
type Draft = Line & { key: string; priceEdited: boolean };

const num = (s: string) => (s === "" || isNaN(+s) ? 0 : +s);
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

function NewQuote() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const brands = useQuery({ queryKey: ["brands"], queryFn: () => listBrands(), staleTime: 5 * 60_000 });
  const lists = useQuery({ queryKey: ["price-lists"], queryFn: () => listPriceLists(), staleTime: 60_000 });
  const customers = useQuery({ queryKey: ["customers"], queryFn: () => listCustomers(), staleTime: 60_000 });

  const [brandId, setBrandId] = useState("");
  const [listId, setListId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [nc, setNc] = useState({ name: "", phone: "", gstin: "" });
  const [inclusive, setInclusive] = useState(true);
  const [igst, setIgst] = useState(false);
  const [extra, setExtra] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Draft[]>([]);
  const [sheet, setSheet] = useState(false);
  const [saving, setSaving] = useState(false);

  const list = useQuery({ queryKey: ["price-list", listId], queryFn: () => getPriceList({ data: { id: listId } }), enabled: !!listId, staleTime: 60_000 });

  // Pre-select the last-used brand and price list on this device.
  useEffect(() => {
    if (brands.data?.length && !brandId) setBrandId(brands.data.find((b) => b.id === recall(LAST_BRAND))?.id ?? brands.data[0]?.id ?? "");
  }, [brands.data, brandId]);
  useEffect(() => {
    if (lists.data?.length && !listId) setListId(lists.data.find((l) => l.id === recall(LAST_LIST))?.id ?? lists.data[0]?.id ?? "");
  }, [lists.data, listId]);

  // New list loaded: take its GST basis and re-price untouched catalog lines.
  useEffect(() => {
    const d = list.data;
    if (!d) return;
    setInclusive(!!d.list.prices_include_gst);
    const byId = new Map(d.items.map((p) => [p.id, p.price]));
    setLines((ls) => ls.map((l) => (l.productId && !l.priceEdited && byId.get(l.productId) != null ? { ...l, unitPrice: byId.get(l.productId)! } : l)));
  }, [list.data]);

  const totals = computeTotals(lines, num(extra), { inclusive, igst });
  const patch = (key: string, p: Partial<Draft>) => setLines((l) => l.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function save() {
    const brand = brands.data?.find((b) => b.id === brandId);
    if (!brand) {
      toast.error("Add a brand first");
      return;
    }
    if (lines.some((l) => l.unitPrice <= 0)) {
      toast.error("Some items have no price");
      return;
    }
    setSaving(true);
    try {
      const { id } = await createQuote({
        data: {
          brandId: brand.id,
          priceListId: listId || null,
          customerId: customerId || null,
          newCustomer: !customerId && nc.name.trim() ? nc : null,
          inclusive,
          igst,
          extra: num(extra),
          notes,
          lines: lines.map(({ key: _k, priceEdited: _p, ...l }) => l),
        },
      });
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      navigate({ to: "/quotes/$id", params: { id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save quote");
      setSaving(false);
    }
  }

  const saveBtn = (
    <Button onClick={save} disabled={saving || !lines.length} className="h-12 rounded-xl px-6 text-base font-semibold">
      {saving ? "Saving…" : "Save quote"}
    </Button>
  );

  return (
    <PageShell
      title="New quote"
      bar={
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{lines.length} items · {inclusive ? "incl. GST" : "+ GST"}</p>
            <p className="text-xl font-bold tabular-nums leading-tight">{fmtMoney(totals.total)}</p>
          </div>
          {saveBtn}
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-[1fr_22rem] md:items-start">
        <div className="space-y-4">
          {brands.data && brands.data.length > 1 && (
            <Field label="Brand">
              <Chips label="Brand" value={brandId} onChange={(id) => { setBrandId(id); remember(LAST_BRAND, id); }}
                options={brands.data.map((b) => ({ value: b.id, label: b.name }))} />
            </Field>
          )}
          {lists.data && lists.data.length > 0 && (
            <Field label="Price list">
              <Chips label="Price list" value={listId} onChange={(id) => { setListId(id); remember(LAST_LIST, id); }}
                options={lists.data.map((l) => ({ value: l.id, label: l.name, sub: l.prices_include_gst ? "incl. GST" : "+ GST" }))} />
            </Field>
          )}

          <Card
            title="Customer"
            aside={
              <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-primary" onClick={() => { setAddingCustomer((v) => !v); setCustomerId(""); }}>
                <UserPlus className="h-4 w-4" /> {addingCustomer ? "Pick existing" : "New"}
              </button>
            }
          >
            {addingCustomer ? (
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Name" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} className={`${inputCls} col-span-2`} />
                <input placeholder="Phone" inputMode="tel" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} className={inputCls} />
                <input placeholder="GSTIN (optional)" value={nc.gstin} onChange={(e) => setNc({ ...nc, gstin: e.target.value.toUpperCase() })} className={inputCls} />
              </div>
            ) : (
              <select className={inputCls} value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Customer">
                <option value="">No customer (walk-in)</option>
                {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
              </select>
            )}
          </Card>

          <Card title={`Items · ${lines.length}`}>
            {lines.map((l, i) => (
              <div key={l.key} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{CATEGORY_LABELS[l.category]} · GST {l.gstRate}%</p>
                    <p className="font-semibold leading-snug">{l.description}</p>
                  </div>
                  <button type="button" aria-label="Remove item" className="-m-2 p-2 text-muted-foreground" onClick={() => setLines((x) => x.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Field label={`Qty (${UNIT_LABELS[l.unit]})`}>
                    <input inputMode="decimal" value={l.qty} onFocus={(e) => e.currentTarget.select()} onChange={(e) => patch(l.key, { qty: num(e.target.value) })} className={inputCls} />
                  </Field>
                  <Field label={`₹ / ${UNIT_LABELS[l.unit]}`}>
                    <input inputMode="decimal" value={l.unitPrice || ""} placeholder="Enter price" onFocus={(e) => e.currentTarget.select()} onChange={(e) => patch(l.key, { unitPrice: num(e.target.value), priceEdited: true })} className={inputCls} />
                  </Field>
                </div>
                <p className="mt-2 text-right text-sm font-semibold tabular-nums">{fmtMoney(lineGross(l))}</p>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setSheet(true)} className="h-12 w-full rounded-xl border-dashed text-base">
              <Plus className="mr-1 h-5 w-5" /> Add item
            </Button>
          </Card>

          <Card title="Tax & charges">
            <label className="flex items-center justify-between">
              <span className="text-sm font-medium">Rates include GST</span>
              <Switch checked={inclusive} onCheckedChange={setInclusive} />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm font-medium">Inter-state supply (IGST)</span>
              <Switch checked={igst} onCheckedChange={setIgst} />
            </label>
            <Field label="Forwarding / extra charges ₹">
              <input inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} className={inputCls} />
            </Field>
            <textarea className="min-h-20 w-full rounded-xl border border-input bg-background p-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Notes: delivery, validity, payment terms…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Card>
        </div>

        <aside className="hidden space-y-2 rounded-2xl border border-border bg-card p-5 md:sticky md:top-20 md:block">
          <TotalsBlock totals={totals} igst={igst} />
          <div className="pt-2 [&>button]:w-full">{saveBtn}</div>
        </aside>
        <div className="md:hidden">
          <Card><TotalsBlock totals={totals} igst={igst} /></Card>
        </div>
      </div>

      <AddItemSheet
        open={sheet}
        onOpenChange={setSheet}
        items={list.data?.items ?? []}
        onAdd={(l) => { setLines((x) => [...x, { ...l, key: crypto.randomUUID(), priceEdited: false }]); toast.success("Added", { duration: 1000 }); }}
      />
    </PageShell>
  );
}

function TotalsBlock({ totals, igst }: { totals: ReturnType<typeof computeTotals>; igst: boolean }) {
  const row = (k: string, v: number) => (
    <div className="flex justify-between text-sm text-muted-foreground"><span>{k}</span><span className="tabular-nums text-foreground">{fmtMoney(v)}</span></div>
  );
  return (
    <div className="space-y-1.5">
      {row("Taxable value", totals.taxable)}
      {igst ? row("IGST", totals.igst) : (<>{row("CGST", totals.cgst)}{row("SGST", totals.sgst)}</>)}
      {totals.roundOff !== 0 && row("Round off", totals.roundOff)}
      <div className="flex items-baseline justify-between border-t border-border pt-2">
        <span className="font-semibold">Total</span>
        <span className="text-2xl font-bold tabular-nums">{fmtMoney(totals.total)}</span>
      </div>
    </div>
  );
}

// Bottom sheet; stays open after "Add" so a whole enquiry can be keyed in without reopening.
function AddItemSheet({ open, onOpenChange, items, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; items: Item[]; onAdd: (l: Line) => void }) {
  const [cat, setCat] = useState<Category | "custom">("pipe");
  // pipe picker
  const pipes = useMemo(() => items.filter((p) => p.category === "pipe"), [items]);
  const [grade, setGrade] = useState("");
  const [roll, setRoll] = useState("");
  const [size, setSize] = useState(0);
  const [pn, setPn] = useState("");
  const [rollLen, setRollLen] = useState(0);
  const [rolls, setRolls] = useState(1);
  const [metres, setMetres] = useState("100");
  // list picker (sprinkler / fitting)
  const [pickId, setPickId] = useState("");
  const [pcs, setPcs] = useState(10);
  const [price, setPrice] = useState(""); // only for products missing from the list
  // custom
  const [cu, setCu] = useState({ name: "", hsn: "3917 40 00", unit: "pc" as Unit, gst: 18, price: "", qty: "1" });

  // Each picker level only offers what exists below it; stale picks fall back to the first valid option.
  const grades = uniq(pipes.map((p) => p.grade ?? ""));
  const g = grades.includes(grade) ? grade : grades[0] ?? "";
  const rollsOpt = uniq(pipes.filter((p) => p.grade === g).map((p) => p.roll ?? "complete"));
  const r = rollsOpt.includes(roll) ? roll : rollsOpt[0] ?? "";
  const sizes = uniq(pipes.filter((p) => p.grade === g && (p.roll ?? "complete") === r).map((p) => p.size_mm ?? 0));
  const s = sizes.includes(size) ? size : sizes[0] ?? 0;
  const pnOpts = pipes.filter((p) => p.grade === g && (p.roll ?? "complete") === r && p.size_mm === s);
  const pipe = pnOpts.find((p) => p.pn === pn) ?? pnOpts[0];
  const lens = (pipe?.roll_lengths ?? "").split("/").map(Number).filter(Boolean);
  const len = lens.includes(rollLen) ? rollLen : lens[0] ?? 0;

  const listItems = items.filter((p) => p.category === cat);
  const picked = listItems.find((p) => p.id === pickId) ?? listItems[0];

  const sel = cat === "pipe" ? pipe : cat === "custom" ? undefined : picked;
  const unitPrice = sel ? sel.price ?? num(price) : num(cu.price);
  const qty = cat === "pipe" ? (len ? rolls * len : num(metres)) : cat === "custom" ? num(cu.qty) : pcs;

  function add() {
    if (cat === "custom") {
      if (!cu.name.trim() || unitPrice <= 0 || qty <= 0) return void toast.error("Enter name, quantity and price");
      onAdd({ productId: null, category: "fitting", description: cu.name.trim(), hsn: cu.hsn || null, unit: cu.unit, qty, unitPrice, gstRate: cu.gst });
      setCu({ ...cu, name: "", price: "" });
      return;
    }
    if (!sel) return void toast.error("Pick a product");
    if (unitPrice <= 0) return void toast.error("This product has no price in the selected list. Enter one.");
    const desc = cat === "pipe" && len ? `${sel.name} · ${rolls} roll${rolls > 1 ? "s" : ""} × ${len} m` : sel.name;
    onAdd({ productId: sel.id, category: sel.category as Category, description: desc, hsn: sel.hsn, unit: sel.unit as Unit, qty, unitPrice, gstRate: sel.gst_rate });
    setPrice("");
  }

  const priceSub = (p?: Item) => (p?.price != null ? `₹${fmtNum(p.price)}` : "no price");

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="pb-2 text-left"><DrawerTitle>Add item</DrawerTitle></DrawerHeader>
        <div className="space-y-4 overflow-y-auto px-4 pb-2">
          <Chips<Category | "custom"> label="Category" value={cat} onChange={setCat}
            options={[...(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => ({ value: c, label: CATEGORY_LABELS[c] })), { value: "custom" as const, label: "Custom" }]} />

          {cat === "pipe" && (
            <>
              {!pipes.length && <p className="text-sm text-muted-foreground">No pipes in the catalog yet.</p>}
              {grades.length > 1 && <Field label="Grade"><Chips label="Grade" value={g} onChange={setGrade} options={grades.map((x) => ({ value: x, label: x }))} /></Field>}
              {rollsOpt.length > 1 && <Field label="Supply"><Chips label="Supply" value={r} onChange={setRoll} options={rollsOpt.map((x) => ({ value: x, label: x === "cut" ? "Cut roll" : "Complete roll" }))} /></Field>}
              <Field label="Size"><Chips label="Size" value={s} onChange={setSize} options={sizes.map((x) => ({ value: x, label: `${x}`, sub: "mm" }))} /></Field>
              <Field label="Pressure class"><Chips label="Pressure class" value={pipe?.pn ?? ""} onChange={setPn} options={pnOpts.map((p) => ({ value: p.pn ?? "", label: p.pn ?? "—", sub: priceSub(p) }))} /></Field>
              {lens.length ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Roll length"><Chips label="Roll length" value={len} onChange={setRollLen} options={lens.map((x) => ({ value: x, label: `${x} m` }))} /></Field>
                  <Field label="Rolls"><Stepper label="Rolls" value={rolls} onChange={setRolls} /></Field>
                </div>
              ) : (
                <Field label="Metres"><input inputMode="decimal" value={metres} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setMetres(e.target.value)} className={inputCls} /></Field>
              )}
            </>
          )}

          {(cat === "sprinkler" || cat === "fitting") && (
            <>
              {!listItems.length && <p className="text-sm text-muted-foreground">No {CATEGORY_LABELS[cat].toLowerCase()} products yet. Add them under Prices, or use Custom.</p>}
              <div className="space-y-2" role="radiogroup" aria-label="Product">
                {listItems.map((p) => (
                  <button key={p.id} type="button" role="radio" aria-checked={picked?.id === p.id} onClick={() => setPickId(p.id)}
                    className={`flex w-full items-center justify-between rounded-xl border p-3 text-left ${picked?.id === p.id ? "border-primary bg-primary/5" : "border-border"}`}>
                    <span className="font-medium">{shortName(p)}</span>
                    <span className="shrink-0 pl-3 text-sm font-semibold tabular-nums">{priceSub(p)}</span>
                  </button>
                ))}
              </div>
              {!!listItems.length && <Field label={`Quantity (${UNIT_LABELS[(picked?.unit ?? "pc") as Unit]})`}><Stepper label="Quantity" value={pcs} onChange={setPcs} /></Field>}
            </>
          )}

          {sel && sel.price == null && (
            <Field label="Price (not in this list)"><input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} /></Field>
          )}

          {cat === "custom" && (
            <div className="space-y-3">
              <Field label="Item name"><input value={cu.name} onChange={(e) => setCu({ ...cu, name: e.target.value })} placeholder="e.g. 110 mm Elbow 90°" className={inputCls} /></Field>
              <Field label="Unit"><Chips<Unit> label="Unit" value={cu.unit} onChange={(u) => setCu({ ...cu, unit: u })} options={[{ value: "pc", label: "Piece" }, { value: "m", label: "Metre" }, { value: "kg", label: "Kg" }]} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Quantity"><input inputMode="decimal" value={cu.qty} onChange={(e) => setCu({ ...cu, qty: e.target.value })} className={inputCls} /></Field>
                <Field label={`₹ / ${UNIT_LABELS[cu.unit]}`}><input inputMode="decimal" value={cu.price} onChange={(e) => setCu({ ...cu, price: e.target.value })} className={inputCls} /></Field>
                <Field label="HSN"><input value={cu.hsn} onChange={(e) => setCu({ ...cu, hsn: e.target.value })} className={inputCls} /></Field>
                <Field label="GST">
                  <select className={inputCls} value={cu.gst} onChange={(e) => setCu({ ...cu, gst: +e.target.value })}>{GST_OPTIONS.map((x) => <option key={x} value={x}>{x}%</option>)}</select>
                </Field>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-foreground tabular-nums">{fmtNum(qty)} {UNIT_LABELS[(sel?.unit ?? cu.unit) as Unit]} × {fmtMoney(unitPrice)}</p>
            <p className="text-lg font-bold tabular-nums leading-tight">{fmtMoney(qty * unitPrice)}</p>
          </div>
          <Button variant="outline" className="h-12 rounded-xl" onClick={() => onOpenChange(false)}>Done</Button>
          <Button className="h-12 rounded-xl px-6 font-semibold" onClick={add}>Add</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
