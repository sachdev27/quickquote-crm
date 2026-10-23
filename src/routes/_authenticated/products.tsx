import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calculator,
  Check,
  Copy,
  Download,
  Plus,
  Printer,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/bottom-nav";
import { Card, Chips, Field, inputCls } from "@/components/qq";
import { Switch } from "@/components/ui/switch";
import { BulkHsn } from "@/components/bulk-hsn";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/sheet";
import {
  bulkUpdateRates,
  importProducts,
  deleteProfile,
  listBrands,
  saveBrandRaw,
  saveProfile,
  setActiveProfile,
  deleteGroup,
  deletePreset,
  listPricing,
  listProducts,
  removeProducts,
  saveGroup,
  savePreset,
  saveProduct,
  saveRate,
  setProductWeight,
} from "@/data/api";
import { LAST_PRESET, newPipe, normalizePn, sectionOf, shortName } from "@/lib/catalog";
import {
  CATEGORY_LABELS,
  GST_OPTIONS,
  UNIT_LABELS,
  costPerKg,
  fmtMoney,
  fmtNum,
  ratePerKg,
  withBrandRaw,
  type Category,
  type Rate,
  type Unit,
} from "@/lib/quote";
import { recall, remember } from "@/lib/utils";
import { csvObjects, toCsv } from "@/lib/csv";
import { useIsDesktop } from "@/hooks/use-mobile";
import { useMe } from "@/hooks/use-me";
import { pipeKgPerM, pnNumber, sdrFor } from "@/lib/weights";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [{ title: "Products & pricing — Tarko CRM" }] }),
  component: ProductsPage,
});

type Product = Awaited<ReturnType<typeof listProducts>>[number];
type Pricing = Awaited<ReturnType<typeof listPricing>>;
type RateForm = {
  preset: string;
  group: string;
  groupName: string;
  raw: string;
  rawNonIsi: string; // blank = non-ISI quotes use the ISI raw price
  production: string;
  transport: string;
  margin: string;
  pct: boolean;
  isNewGroup: boolean;
};
type ProductForm = Partial<Omit<Product, "weight_kg">> & { weight: string };
type Tab = "pricing" | "weights" | "products";

const n = (s: string) => Number(s) || 0;
const parts = (r: Rate) =>
  `${fmtNum(r.raw_kg)} + ${fmtNum(r.production_kg)} + ${fmtNum(r.transport_kg)} + ${r.margin_is_pct ? `${fmtNum(r.margin)}%` : `₹${fmtNum(r.margin)}`}`;
const isWeight = (p: Pick<Product, "grade" | "size_mm" | "pn">) => {
  const sdr = p.grade && p.size_mm ? sdrFor(p.grade, pnNumber(p.pn)) : null;
  return sdr && p.size_mm ? pipeKgPerM(p.size_mm, sdr) : null;
};

function ProductsPage() {
  const me = useMe();
  if (me.role && !me.isAdmin)
    return (
      <PageShell title="Products & pricing">
        <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Only admins can view and change products and pricing.{" "}
          <Link
            to="/price-list"
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            Open the price list
          </Link>{" "}
          to see current prices.
        </p>
      </PageShell>
    );
  return <ProductsAdmin />;
}

function ProductsAdmin() {
  const qc = useQueryClient();
  const pricing = useQuery({
    queryKey: ["pricing"],
    queryFn: () => listPricing(),
    staleTime: 60_000,
  });
  const prods = useQuery({
    queryKey: ["products"],
    queryFn: () => listProducts(),
    staleTime: 60_000,
  });
  const [tab, setTab] = useState<Tab>("pricing");
  const brands = useQuery({
    queryKey: ["brands"],
    queryFn: () => listBrands(),
    staleTime: 5 * 60_000,
  });
  const [presetId, setPresetId] = useState(""); // whose prices the product list shows
  const [profileId, setProfileId] = useState(""); // which period's values are shown/edited (defaults to active)
  const [profileForm, setProfileForm] = useState<null | {
    id?: string;
    name: string;
    copyFrom: string;
  }>(null);
  const [card, setCard] = useState<RateForm | null>(null);
  const [presetForm, setPresetForm] = useState<null | {
    id?: string;
    name: string;
    copyFrom: string;
  }>(null);
  const [bulk, setBulk] = useState(false);
  const [groupForm, setGroupForm] = useState<null | { id: string; name: string }>(null);
  const [prod, setProd] = useState<ProductForm | null>(null);
  const desktop = useIsDesktop();

  useEffect(() => {
    const ps = pricing.data?.presets;
    if (ps?.length && !ps.some((p) => p.id === presetId))
      setPresetId(ps.find((p) => p.id === recall(LAST_PRESET))?.id ?? ps[0]!.id);
  }, [pricing.data, presetId]);

  useEffect(() => {
    const d = pricing.data;
    if (d && !d.profiles.some((p) => p.id === profileId)) setProfileId(d.activeProfileId);
  }, [pricing.data, profileId]);
  // Everything below works on one profile's values.
  const scoped = pricing.data && {
    ...pricing.data,
    rates: pricing.data.rates.filter((r) => r.profile_id === profileId),
  };
  // Grid can show any brand's effective ₹/kg: that brand's raw (if set) replaces the preset raw.
  const [viewBrand, setViewBrand] = useState("");
  const gridRow = (preset: string, group: string) => {
    const r = rateRow(preset, group);
    const b = viewBrand
      ? pricing.data?.brandRaw.find(
          (x) => x.profile_id === profileId && x.brand_id === viewBrand && x.group_id === group,
        )
      : undefined;
    return r && { ...withBrandRaw(r, b), brandApplied: !!b };
  };
  const profileName = (id: string) => pricing.data?.profiles.find((p) => p.id === id)?.name ?? "";
  const rateRow = (preset: string, group: string) =>
    scoped?.rates.find((r) => r.preset_id === preset && r.group_id === group);
  const rateOf = (group: string) => {
    const r = rateRow(presetId, group);
    return r ? ratePerKg(r) : 0;
  };

  const editRate = (preset: string, g: { id: string; name: string }) => {
    const r = rateRow(preset, g.id);
    setCard({
      preset,
      group: g.id,
      groupName: g.name,
      raw: String(r?.raw_kg ?? ""),
      rawNonIsi: r?.raw_kg_non_isi != null ? String(r.raw_kg_non_isi) : "",
      production: String(r?.production_kg ?? ""),
      transport: String(r?.transport_kg ?? ""),
      margin: String(r?.margin ?? ""),
      pct: r ? !!r.margin_is_pct : true,
      isNewGroup: false,
    });
  };

  async function submitCard(e: React.FormEvent) {
    e.preventDefault();
    if (!card) return;
    try {
      if (card.isNewGroup) await saveGroup({ data: { id: card.group, name: card.groupName } });
      await saveRate({
        data: {
          profile_id: profileId,
          preset_id: card.preset,
          group_id: card.group.toUpperCase(),
          raw_kg: n(card.raw),
          raw_kg_non_isi: card.rawNonIsi.trim() === "" ? null : n(card.rawNonIsi),
          production_kg: n(card.production),
          transport_kg: n(card.transport),
          margin: n(card.margin),
          margin_is_pct: card.pct,
        },
      });
      await qc.invalidateQueries({ queryKey: ["pricing"] });
      setCard(null);
      toast.success("Rate saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message.slice(0, 140) : "Could not save");
    }
  }

  async function submitPreset(e: React.FormEvent) {
    e.preventDefault();
    if (!presetForm?.name.trim()) return;
    try {
      const { id } = await savePreset({
        data: {
          ...(presetForm.id ? { id: presetForm.id } : {}),
          name: presetForm.name,
          ...(presetForm.copyFrom ? { copyFrom: presetForm.copyFrom } : {}),
        },
      });
      await qc.invalidateQueries({ queryKey: ["pricing"] });
      setPresetId(id);
      remember(LAST_PRESET, id);
      setPresetForm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message.slice(0, 140) : "Could not save");
    }
  }

  async function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profileForm?.name.trim()) return;
    try {
      const { id } = await saveProfile({
        data: {
          ...(profileForm.id ? { id: profileForm.id } : {}),
          name: profileForm.name,
          ...(profileForm.copyFrom ? { copyFrom: profileForm.copyFrom } : {}),
        },
      });
      await qc.invalidateQueries({ queryKey: ["pricing"] });
      setProfileId(id);
      setProfileForm(null);
      if (!profileForm.id)
        toast.success("Profile created. Edit its values or bulk update, then make it active.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message.slice(0, 140) : "Could not save");
    }
  }
  async function deleteProfileNow(pr: { id: string; name: string }) {
    const active = pr.id === pricing.data?.activeProfileId;
    const warn = `Delete profile "${pr.name}"?\n\nAll its rates and brand raw prices are removed permanently. Saved quotes keep their prices.${
      active ? "\n\nIt is the ACTIVE profile: the newest remaining profile becomes active." : ""
    }`;
    if (!confirm(warn)) return;
    try {
      const res = await deleteProfile({ data: { id: pr.id } });
      await qc.invalidateQueries({ queryKey: ["pricing"] });
      setProfileId("");
      toast.success(
        res.activated ? `Deleted. "${res.activated}" is now active.` : "Profile deleted",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message.slice(0, 160) : "Could not delete");
    }
  }
  async function removeProfile() {
    if (!profileForm?.id || !confirm(`Delete profile "${profileForm.name}" and all its values?`))
      return;
    try {
      await deleteProfile({ data: { id: profileForm.id } });
      await qc.invalidateQueries({ queryKey: ["pricing"] });
      setProfileForm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message.slice(0, 160) : "Could not delete");
    }
  }
  async function makeActive(id: string) {
    await setActiveProfile({ data: { id } });
    await qc.invalidateQueries({ queryKey: ["pricing"] });
    toast.success(`${profileName(id)} is now active for new quotes`);
  }

  async function removePreset() {
    if (!presetForm?.id || !confirm(`Delete preset "${presetForm.name}"?`)) return;
    await deletePreset({ data: { id: presetForm.id } });
    await qc.invalidateQueries({ queryKey: ["pricing"] });
    setPresetForm(null);
  }

  async function submitProduct(e: React.FormEvent | null, active = true) {
    e?.preventDefault();
    const p = prod;
    if (!p?.name?.trim()) return void toast.error("Name is required");
    if (!p.rate_group_id) return void toast.error("Pick a rate group");
    try {
      await saveProduct({
        data: {
          ...(p.id ? { id: p.id } : {}),
          category: (p.category ?? "fitting") as Category,
          rate_group_id: p.rate_group_id,
          name: p.name,
          grade: p.grade ?? null,
          roll: p.roll ?? null,
          pn: p.pn ?? null,
          inch: p.inch ?? null,
          roll_lengths: p.roll_lengths ?? null,
          hsn: p.hsn ?? null,
          size_mm: p.size_mm ?? null,
          unit: (p.unit ?? "pc") as Unit,
          weight_kg: n(p.weight),
          gst_rate: p.gst_rate ?? 18,
          active,
        },
      });
      await qc.invalidateQueries({ queryKey: ["products"] });
      setProd(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message.slice(0, 140) : "Could not save");
    }
  }

  async function saveWeight(p: Product, v: string) {
    const w = Number(v);
    if (!isFinite(w) || w < 0) return void toast.error("Invalid weight");
    await setProductWeight({ data: { id: p.id, weight_kg: w } });
    qc.setQueryData(["products"], (old: Product[] | undefined) =>
      old?.map((x) => (x.id === p.id ? { ...x, weight_kg: w } : x)),
    );
  }

  const calcWeight = () => {
    if (!prod?.size_mm || !prod.grade) return void toast.error("Set size, grade and PN first");
    const sdr = sdrFor(prod.grade, pnNumber(prod.pn ?? null));
    if (!sdr) return void toast.error("Unknown grade/PN for IS 4984 (use PE63, PE80 or PE100)");
    setProd({ ...prod, weight: pipeKgPerM(prod.size_mm, sdr).toFixed(3) });
    toast.success(`IS 4984: SDR ${sdr}`);
  };

  const cardRate = card
    ? ratePerKg({
        raw_kg: n(card.raw),
        production_kg: n(card.production),
        transport_kg: n(card.transport),
        margin: n(card.margin),
        margin_is_pct: card.pct ? 1 : 0,
      })
    : 0;
  const presetName = (id: string) => pricing.data?.presets.find((p) => p.id === id)?.name ?? "";

  // Product editor: bottom sheet on phones, the right-hand pane on desktop.
  const productForm = prod && (
    <form onSubmit={submitProduct} className="@container flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 @2xl:grid @2xl:grid-cols-2 @2xl:items-start @2xl:gap-x-6 @2xl:gap-y-4 @2xl:space-y-0">
        <Chips<Category>
          label="Category"
          value={(prod.category ?? "fitting") as Category}
          onChange={(c) =>
            setProd({
              ...prod,
              category: c,
              gst_rate: c === "sprinkler" ? 5 : 18,
              unit: c === "pipe" ? "m" : (prod.unit ?? "pc"),
            })
          }
          options={(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => ({
            value: c,
            label: CATEGORY_LABELS[c],
          }))}
        />
        <Field label="Name (as printed on quote)">
          <input
            value={prod.name ?? ""}
            onChange={(e) => setProd({ ...prod, name: e.target.value })}
            placeholder="e.g. 110 mm Elbow 90°"
            className={inputCls}
          />
        </Field>
        <Field label="Rate group">
          <Chips
            label="Rate group"
            value={prod.rate_group_id ?? ""}
            onChange={(id) => setProd({ ...prod, rate_group_id: id })}
            options={(pricing.data?.groups ?? []).map((g) => ({
              value: g.id,
              label: g.name,
              sub: `${fmtMoney(rateOf(g.id))}/kg`,
            }))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Size (mm)">
            <input
              inputMode="numeric"
              value={prod.size_mm ?? ""}
              onChange={(e) =>
                setProd({
                  ...prod,
                  size_mm: e.target.value ? Number(e.target.value) : null,
                })
              }
              className={inputCls}
            />
          </Field>
          <Field label="Inch (trade size)">
            <input
              value={prod.inch ?? ""}
              onChange={(e) => setProd({ ...prod, inch: e.target.value })}
              placeholder='2"'
              className={inputCls}
            />
          </Field>
          <Field label="Grade">
            <input
              value={prod.grade ?? ""}
              onChange={(e) => setProd({ ...prod, grade: e.target.value.toUpperCase() })}
              placeholder="PE63"
              className={inputCls}
            />
          </Field>
          <Field label="Pressure class">
            <input
              value={prod.pn ?? ""}
              onChange={(e) => setProd({ ...prod, pn: e.target.value })}
              placeholder="PN 6"
              className={inputCls}
            />
          </Field>
        </div>
        {prod.category === "pipe" && (
          <div className="grid grid-cols-1 gap-2">
            <Field label="Roll lengths (m)">
              <input
                value={prod.roll_lengths ?? ""}
                onChange={(e) => setProd({ ...prod, roll_lengths: e.target.value })}
                placeholder="300/500"
                className={inputCls}
              />
            </Field>
          </div>
        )}
        <Field label="Sold per">
          <Chips<Unit>
            label="Unit"
            value={(prod.unit ?? "pc") as Unit}
            onChange={(u) => setProd({ ...prod, unit: u })}
            options={[
              { value: "m", label: "Metre" },
              { value: "pc", label: "Piece" },
              { value: "kg", label: "Kg" },
            ]}
          />
        </Field>
        <Field label={`Weight (kg per ${UNIT_LABELS[(prod.unit ?? "pc") as Unit]})`}>
          <div className="flex gap-2">
            <input
              inputMode="decimal"
              value={prod.weight}
              onChange={(e) => setProd({ ...prod, weight: e.target.value })}
              className={inputCls}
            />
            {prod.category === "pipe" && (
              <Button
                type="button"
                variant="outline"
                className="h-12 shrink-0 rounded-xl"
                onClick={calcWeight}
              >
                <Calculator className="mr-1 h-4 w-4" /> IS 4984
              </Button>
            )}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="GST">
            <select
              className={inputCls}
              value={prod.gst_rate ?? 18}
              onChange={(e) => setProd({ ...prod, gst_rate: +e.target.value })}
            >
              {GST_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}%
                </option>
              ))}
            </select>
          </Field>
          <Field label="HSN/SAC">
            <input
              value={prod.hsn ?? ""}
              onChange={(e) => setProd({ ...prod, hsn: e.target.value })}
              className={inputCls}
            />
          </Field>
        </div>
        <div className="flex items-baseline justify-between rounded-xl bg-secondary px-4 py-3 tabular-nums">
          <span className="text-sm text-muted-foreground">
            {fmtNum(n(prod.weight), 3)} kg × {fmtMoney(rateOf(prod.rate_group_id ?? ""))}/kg (
            {presetName(presetId)})
          </span>
          <span className="text-xl font-bold">
            {fmtMoney(rateOf(prod.rate_group_id ?? "") * n(prod.weight))}
            <span className="text-sm font-medium text-muted-foreground">
              /{UNIT_LABELS[(prod.unit ?? "pc") as Unit]}
            </span>
          </span>
        </div>
      </div>
      <div className="flex gap-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {prod.id && (
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl"
            onClick={() =>
              confirm("Remove this product from the catalog?") && submitProduct(null, false)
            }
          >
            Remove
          </Button>
        )}
        <Button type="submit" className="h-12 flex-1 rounded-xl text-base font-semibold">
          Save product
        </Button>
      </div>
    </form>
  );

  return (
    <PageShell
      title="Products & pricing"
      wide
      actions={
        <Link
          to="/price-list"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold"
        >
          <Printer className="h-4 w-4" /> <span className="hidden sm:inline">Price list</span>
        </Link>
      }
    >
      <div className="mx-auto max-w-4xl space-y-4 lg:max-w-none lg:space-y-2">
        <Chips<Tab>
          label="Section"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setProd(null);
          }}
          options={[
            { value: "pricing", label: "Pricing" },
            { value: "weights", label: "Weight chart" },
            { value: "products", label: "Products" },
          ]}
        />

        {tab === "pricing" && pricing.data && (
          <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start lg:gap-2 lg:space-y-0">
            <PricingGrid
              pricing={scoped!}
              profileId={profileId}
              onProfile={setProfileId}
              onMakeActive={makeActive}
              onNewProfile={() => setProfileForm({ name: "", copyFrom: profileId })}
              onEditProfile={(pr) => setProfileForm({ id: pr.id, name: pr.name, copyFrom: "" })}
              onDeleteProfile={deleteProfileNow}
              rateRow={gridRow}
              brands={brands.data ?? []}
              viewBrand={viewBrand}
              onViewBrand={setViewBrand}
              onEdit={editRate}
              onRenamePreset={(p) => setPresetForm({ id: p.id, name: p.name, copyFrom: "" })}
              onNewPreset={() => setPresetForm({ name: "", copyFrom: presetId })}
              onNewGroup={() =>
                setCard({
                  preset: presetId,
                  group: "",
                  groupName: "",
                  raw: "",
                  rawNonIsi: "",
                  production: "",
                  transport: "",
                  margin: "",
                  pct: true,
                  isNewGroup: true,
                })
              }
              onBulk={() => setBulk(true)}
              onEditGroup={(g) => setGroupForm({ id: g.id, name: g.name })}
            />
            <BrandRawCard
              brands={brands.data ?? []}
              groups={pricing.data.groups}
              rows={pricing.data.brandRaw.filter((b) => b.profile_id === profileId)}
              profileId={profileId}
              profileName={profileName(profileId)}
              onSaved={() => qc.invalidateQueries({ queryKey: ["pricing"] })}
            />
          </div>
        )}

        {tab === "weights" && (
          <WeightChart
            products={prods.data ?? []}
            onSaveMany={async (changes) => {
              await Promise.all(
                changes.map(({ p, weight }) =>
                  setProductWeight({ data: { id: p.id, weight_kg: weight } }),
                ),
              );
              await qc.invalidateQueries({ queryKey: ["products"] });
            }}
            onCreated={() => qc.invalidateQueries({ queryKey: ["products"] })}
            onAddOther={(cat) =>
              setProd(
                cat === "sprinkler"
                  ? {
                      category: "sprinkler",
                      rate_group_id: "SPRINKLER",
                      unit: "pc",
                      gst_rate: 5,
                      hsn: "3917 21 90",
                      weight: "",
                    }
                  : {
                      category: "fitting",
                      rate_group_id: "FITTING",
                      unit: "pc",
                      gst_rate: 18,
                      hsn: "3917 40 00",
                      weight: "",
                    },
              )
            }
          />
        )}

        {tab === "products" && (
          <ProductList
            selectedId={prod?.id ?? ""}
            pane={
              prod ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex items-center justify-between px-4 pt-4">
                    <p className="font-semibold">{prod.id ? "Edit product" : "New product"}</p>
                    <button
                      type="button"
                      className="text-sm text-muted-foreground hover:text-foreground"
                      onClick={() => setProd(null)}
                    >
                      Close
                    </button>
                  </div>
                  {prod.id && <PresetPreview product={prod} pricing={scoped} />}
                  <div className="flex min-h-0 flex-1 flex-col pt-3">{productForm}</div>
                </div>
              ) : null
            }
            products={prods.data ?? []}
            loading={prods.isLoading}
            pricing={scoped}
            presetId={presetId}
            onPreset={(id) => {
              setPresetId(id);
              remember(LAST_PRESET, id);
            }}
            rateOf={rateOf}
            onSaveWeight={saveWeight}
            onEdit={(p) => setProd({ ...p, weight: String(p.weight_kg) })}
            onAdd={() =>
              setProd({
                category: "fitting",
                rate_group_id: "FITTING",
                unit: "pc",
                gst_rate: 18,
                hsn: "3917 40 00",
                weight: "",
              })
            }
          />
        )}
      </div>

      {/* Edit one preset × group rate */}
      <Drawer open={!!card} onOpenChange={(o) => !o && setCard(null)}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>
              {card?.isNewGroup
                ? "New rate group"
                : `${card?.groupName} · ${presetName(card?.preset ?? "")} · ${profileName(profileId)}`}
            </DrawerTitle>
          </DrawerHeader>
          {card && (
            <form
              onSubmit={submitCard}
              className="space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              {card.isNewGroup && (
                <>
                  <div className="grid grid-cols-[1fr_7rem] gap-2">
                    <Field label="Name">
                      <input
                        value={card.groupName}
                        onChange={(e) => setCard({ ...card, groupName: e.target.value })}
                        placeholder="e.g. Drip lateral"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Key">
                      <input
                        value={card.group}
                        onChange={(e) => setCard({ ...card, group: e.target.value.toUpperCase() })}
                        placeholder="DRIP"
                        className={`${inputCls} uppercase`}
                      />
                    </Field>
                  </div>
                  <Field label="Rates below are for preset">
                    <Chips
                      label="Preset"
                      value={card.preset}
                      onChange={(p) => setCard({ ...card, preset: p })}
                      options={(pricing.data?.presets ?? []).map((p) => ({
                        value: p.id,
                        label: p.name,
                      }))}
                    />
                  </Field>
                </>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Raw material ₹/kg">
                  <input
                    inputMode="decimal"
                    value={card.raw}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setCard({ ...card, raw: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Non-ISI raw ₹/kg (optional)">
                  <input
                    inputMode="decimal"
                    value={card.rawNonIsi}
                    placeholder={`same as ISI (${card.raw || 0})`}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setCard({ ...card, rawNonIsi: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Production ₹/kg">
                  <input
                    inputMode="decimal"
                    value={card.production}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setCard({ ...card, production: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Transport ₹/kg">
                  <input
                    inputMode="decimal"
                    value={card.transport}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setCard({ ...card, transport: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label={`Profit margin ${card.pct ? "%" : "₹/kg"}`}>
                  <input
                    inputMode="decimal"
                    value={card.margin}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setCard({ ...card, margin: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <Chips
                label="Margin type"
                value={card.pct ? "pct" : "flat"}
                onChange={(v) => setCard({ ...card, pct: v === "pct" })}
                options={[
                  { value: "pct", label: "Margin %" },
                  { value: "flat", label: "Margin ₹/kg" },
                ]}
              />
              <div className="flex items-baseline justify-between rounded-xl bg-secondary px-4 py-3">
                <span className="text-sm text-muted-foreground">
                  Cost{" "}
                  {fmtMoney(
                    costPerKg({
                      raw_kg: n(card.raw),
                      production_kg: n(card.production),
                      transport_kg: n(card.transport),
                    }),
                  )}{" "}
                  → sell
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {fmtMoney(cardRate)}
                  <span className="text-sm font-medium text-muted-foreground">/kg</span>
                </span>
              </div>
              {card.rawNonIsi.trim() !== "" && (
                <p className="text-right text-sm tabular-nums text-muted-foreground">
                  Non-ISI sell{" "}
                  <b className="text-foreground">
                    {fmtMoney(
                      ratePerKg(
                        {
                          raw_kg: n(card.raw),
                          raw_kg_non_isi: n(card.rawNonIsi),
                          production_kg: n(card.production),
                          transport_kg: n(card.transport),
                          margin: n(card.margin),
                          margin_is_pct: card.pct ? 1 : 0,
                        },
                        true,
                      ),
                    )}
                    /kg
                  </b>
                </p>
              )}
              <Button type="submit" className="h-12 w-full rounded-xl text-base font-semibold">
                Save
              </Button>
            </form>
          )}
        </DrawerContent>
      </Drawer>

      <Drawer open={!!presetForm} onOpenChange={(o) => !o && setPresetForm(null)}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{presetForm?.id ? "Rename preset" : "New preset"}</DrawerTitle>
          </DrawerHeader>
          {presetForm && (
            <form
              onSubmit={submitPreset}
              className="space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <Field label="Name">
                <input
                  value={presetForm.name}
                  onChange={(e) => setPresetForm({ ...presetForm, name: e.target.value })}
                  placeholder="e.g. Dealer A, Retail, Tender"
                  className={inputCls}
                />
              </Field>
              {!presetForm.id && (
                <Field label="Start with values from">
                  <select
                    className={inputCls}
                    value={presetForm.copyFrom}
                    onChange={(e) => setPresetForm({ ...presetForm, copyFrom: e.target.value })}
                  >
                    <option value="">Blank</option>
                    {pricing.data?.presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="flex gap-2">
                {presetForm.id && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 rounded-xl"
                    onClick={removePreset}
                  >
                    Delete
                  </Button>
                )}
                <Button type="submit" className="h-12 flex-1 rounded-xl text-base font-semibold">
                  Save
                </Button>
              </div>
            </form>
          )}
        </DrawerContent>
      </Drawer>

      <Drawer open={!!groupForm} onOpenChange={(o) => !o && setGroupForm(null)}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Rate group</DrawerTitle>
          </DrawerHeader>
          {groupForm && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await saveGroup({ data: groupForm });
                  await qc.invalidateQueries({ queryKey: ["pricing"] });
                  setGroupForm(null);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message.slice(0, 140) : "Could not save");
                }
              }}
              className="space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <Field label={`Name (key ${groupForm.id})`}>
                <input
                  value={groupForm.name}
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-xl"
                  onClick={async () => {
                    if (!confirm(`Delete rate group ${groupForm.name} and its rates?`)) return;
                    try {
                      await deleteGroup({ data: { id: groupForm.id } });
                      await qc.invalidateQueries({ queryKey: ["pricing"] });
                      setGroupForm(null);
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message.slice(0, 160) : "Could not delete",
                      );
                    }
                  }}
                >
                  Delete
                </Button>
                <Button type="submit" className="h-12 flex-1 rounded-xl text-base font-semibold">
                  Save
                </Button>
              </div>
            </form>
          )}
        </DrawerContent>
      </Drawer>

      <Drawer open={!!profileForm} onOpenChange={(o) => !o && setProfileForm(null)}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{profileForm?.id ? "Rename profile" : "New profile"}</DrawerTitle>
          </DrawerHeader>
          {profileForm && (
            <form
              onSubmit={submitProfile}
              className="space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <Field label="Name">
                <input
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  placeholder="e.g. Q4 FY26-27 (Jan–Mar)"
                  className={inputCls}
                />
              </Field>
              {!profileForm.id && (
                <Field label="Start with values from">
                  <select
                    className={inputCls}
                    value={profileForm.copyFrom}
                    onChange={(e) => setProfileForm({ ...profileForm, copyFrom: e.target.value })}
                  >
                    <option value="">Blank</option>
                    {pricing.data?.profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="flex gap-2">
                {profileForm.id && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 rounded-xl"
                    onClick={removeProfile}
                  >
                    Delete
                  </Button>
                )}
                <Button type="submit" className="h-12 flex-1 rounded-xl text-base font-semibold">
                  Save
                </Button>
              </div>
            </form>
          )}
        </DrawerContent>
      </Drawer>

      {pricing.data && (
        <BulkSheet
          open={bulk}
          onOpenChange={setBulk}
          pricing={scoped!}
          profileId={profileId}
          profileName={profileName(profileId)}
          onDone={() => qc.invalidateQueries({ queryKey: ["pricing"] })}
        />
      )}

      <Drawer
        open={!!prod && (!desktop || tab !== "products")}
        onOpenChange={(o) => !o && setProd(null)}
      >
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{prod?.id ? "Edit product" : "New product"}</DrawerTitle>
          </DrawerHeader>
          {productForm}
        </DrawerContent>
      </Drawer>
    </PageShell>
  );
}

// Grade × preset grid. Each cell is one saved ₹/kg; tap to edit.
function PricingGrid({
  brands,
  viewBrand,
  onViewBrand,
  pricing,
  profileId,
  onProfile,
  onMakeActive,
  onNewProfile,
  onEditProfile,
  onDeleteProfile,
  rateRow,
  onEdit,
  onRenamePreset,
  onNewPreset,
  onNewGroup,
  onBulk,
  onEditGroup,
}: {
  onEditGroup: (g: { id: string; name: string }) => void;
  pricing: Pricing;
  profileId: string;
  onProfile: (id: string) => void;
  onMakeActive: (id: string) => void;
  onNewProfile: () => void;
  onEditProfile: (p: { id: string; name: string }) => void;
  onDeleteProfile: (p: { id: string; name: string }) => void;
  rateRow: (preset: string, group: string) => (Rate & { brandApplied?: boolean }) | undefined;
  brands: { id: string; name: string }[];
  viewBrand: string;
  onViewBrand: (id: string) => void;
  onEdit: (preset: string, g: { id: string; name: string }) => void;
  onRenamePreset: (p: { id: string; name: string }) => void;
  onNewPreset: () => void;
  onNewGroup: () => void;
  onBulk: () => void;
}) {
  const isActive = profileId === pricing.activeProfileId;
  const current = pricing.profiles.find((p) => p.id === profileId);
  return (
    <>
      <Card title="Profile" className="lg:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <select
              aria-label="Profile"
              value={profileId}
              onChange={(e) => onProfile(e.target.value)}
              className={`${inputCls} max-w-md font-semibold`}
            >
              {pricing.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === pricing.activeProfileId ? "  ● active" : ""}
                </option>
              ))}
            </select>
            {isActive && (
              <span
                title="Active: new quotes and the price list use these values."
                className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 lg:py-0.5"
              >
                Active
              </span>
            )}
            {!isActive && (
              <span className="hidden shrink-0 text-xs text-amber-700 lg:inline">
                Not active: edit freely, then Make active. Old quotes keep their values.
              </span>
            )}
          </label>
          {current && !isActive && (
            <Button className="h-11 rounded-xl" onClick={() => onMakeActive(current.id)}>
              Make active
            </Button>
          )}
          {current && (
            <Button
              variant="ghost"
              className="h-11 rounded-xl"
              onClick={() => onEditProfile(current)}
            >
              Rename
            </Button>
          )}
          {current && (
            <Button
              variant="ghost"
              className="h-11 rounded-xl text-destructive hover:text-destructive"
              disabled={pricing.profiles.length < 2}
              title={pricing.profiles.length < 2 ? "At least one profile must remain" : undefined}
              onClick={() => onDeleteProfile(current)}
            >
              Delete
            </Button>
          )}
          <Button variant="outline" className="h-11 rounded-xl" onClick={onNewProfile}>
            <Copy className="mr-1 h-4 w-4" /> New profile
          </Button>
        </div>
        <p className="text-xs text-muted-foreground lg:hidden">
          {isActive
            ? "Active: new quotes and the price list use these values."
            : "Not active: edit freely, then Make active when the new period starts. Old quotes keep their values."}
        </p>
      </Card>
      <Card title={`₹ per kg · grade × preset${current ? ` · ${current.name}` : ""}`}>
        <p className="-mt-1 text-xs text-muted-foreground lg:hidden">
          Raw material + production + transport + profit margin. GST is added on the quote. Tap a
          cell to edit its rate; tap a preset or grade name to rename or delete it.
        </p>
        <div className="space-y-2 lg:flex lg:flex-wrap lg:items-end lg:justify-between lg:gap-2 lg:space-y-0">
          <Field label="Prices for brand (a brand's own raw price replaces the preset raw)">
            <Chips
              label="Show prices for brand"
              value={viewBrand}
              onChange={onViewBrand}
              options={[
                { value: "", label: "Preset raw" },
                ...brands.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2 lg:flex lg:gap-1.5">
            <Button variant="outline" className="h-11 rounded-xl" onClick={onBulk}>
              <SlidersHorizontal className="mr-1 h-4 w-4" /> Bulk update
            </Button>
            <Button variant="outline" className="h-11 rounded-xl" onClick={onNewPreset}>
              <Copy className="mr-1 h-4 w-4" /> New preset
            </Button>
          </div>
        </div>
        <div className="-mx-4 overflow-x-auto px-4 lg:-mx-3 lg:px-3">
          <table className="w-full min-w-[28rem] border-separate border-spacing-0 tabular-nums">
            <thead>
              <tr>
                <th className="sticky left-0 bg-card py-2 pr-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Grade
                </th>
                {pricing.presets.map((p) => (
                  <th key={p.id} className="px-1 py-2 text-right">
                    <button
                      type="button"
                      className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                      onClick={() => onRenamePreset(p)}
                    >
                      {p.name}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pricing.groups.map((g) => (
                <tr key={g.id}>
                  <td className="sticky left-0 border-t border-border/60 bg-card py-2 pr-2 lg:py-0.5">
                    <button
                      type="button"
                      className="text-left text-sm font-medium underline-offset-4 hover:underline"
                      onClick={() => onEditGroup(g)}
                    >
                      {g.name}
                    </button>
                  </td>
                  {pricing.presets.map((p) => {
                    const r = rateRow(p.id, g.id);
                    return (
                      <td key={p.id} className="border-t border-border/60 p-1">
                        <button
                          type="button"
                          onClick={() => onEdit(p.id, g)}
                          className="w-full rounded-lg px-2 py-1.5 text-right active:bg-secondary hover:bg-secondary lg:py-0.5"
                        >
                          {r ? (
                            <span className="flex items-start justify-end gap-3">
                              <span>
                                <span className="block text-base font-bold lg:text-sm">
                                  {fmtMoney(ratePerKg(r))}
                                </span>
                                <span
                                  className={`block text-[10px] ${r.brandApplied ? "font-semibold text-primary" : "text-muted-foreground"}`}
                                >
                                  {parts(r)}
                                  {r.brandApplied && " · brand raw"}
                                </span>
                              </span>
                              {r.raw_kg_non_isi != null && (
                                <>
                                  <span
                                    className="self-stretch border-l border-border"
                                    aria-hidden
                                  />
                                  <span className="text-amber-700">
                                    <span className="block text-base font-bold lg:text-sm">
                                      {fmtMoney(ratePerKg(r, true))}
                                    </span>
                                    <span className="block text-[10px] font-semibold">
                                      Non-ISI · raw {fmtNum(r.raw_kg_non_isi)}
                                    </span>
                                  </span>
                                </>
                              )}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">not set</span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary"
          onClick={onNewGroup}
        >
          <Plus className="h-4 w-4" /> Add rate group
        </button>
      </Card>
    </>
  );
}

const FIELD_LABELS = {
  raw_kg: "Raw material",
  raw_kg_non_isi: "Raw (non-ISI)",
  production_kg: "Production",
  transport_kg: "Transport",
  margin: "Profit margin",
} as const;
type BulkField = keyof typeof FIELD_LABELS;

// Change one variable across many grades × presets at once, e.g. raw material +₹5 everywhere.
function BulkSheet({
  open,
  onOpenChange,
  pricing,
  profileId,
  profileName,
  onDone,
}: {
  profileId: string;
  profileName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pricing: Pricing;
  onDone: () => void;
}) {
  const [field, setField] = useState<BulkField>("raw_kg");
  const [mode, setMode] = useState<"add" | "set">("set");
  const [value, setValue] = useState("");
  const [presets, setPresets] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  useEffect(() => {
    if (open) {
      setPresets(pricing.presets.map((p) => p.id));
      setGroups(pricing.groups.map((g) => g.id));
    }
  }, [open, pricing]);
  const toggle = (xs: string[], x: string) =>
    xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x];
  const unit = field === "margin" ? "(% or ₹/kg, per each rate's margin type)" : "₹/kg";

  async function apply() {
    const v = Number(value);
    if (value === "" || !isFinite(v)) return void toast.error("Enter a number");
    if (!presets.length || !groups.length)
      return void toast.error("Pick at least one preset and grade");
    try {
      const { updated } = await bulkUpdateRates({
        data: { profileId, field, mode, value: v, presetIds: presets, groupIds: groups },
      });
      onDone();
      onOpenChange(false);
      setValue("");
      toast.success(`Updated ${updated} rate${updated === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message.slice(0, 140) : "Could not update");
    }
  }

  const multi = (
    items: { id: string; name: string }[],
    sel: string[],
    set: (xs: string[]) => void,
  ) => (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const on = sel.includes(it.id);
        return (
          <button
            key={it.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => set(toggle(sel, it.id))}
            className={`h-11 rounded-xl border px-3 text-sm font-semibold ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
          >
            {on && <Check className="mr-1 inline h-4 w-4" />}
            {it.name}
          </button>
        );
      })}
    </div>
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>Bulk update · {profileName}</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4 overflow-y-auto px-4 pb-2">
          <Field label="Change">
            <Chips<BulkField>
              label="Variable"
              value={field}
              onChange={setField}
              options={(Object.keys(FIELD_LABELS) as BulkField[]).map((f) => ({
                value: f,
                label: FIELD_LABELS[f],
              }))}
            />
          </Field>
          <Field label="How">
            <Chips
              label="Mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: "set" as const, label: "Set to" },
                { value: "add" as const, label: "Change by ±" },
              ]}
            />
          </Field>
          <Field label={`${mode === "add" ? "Amount (use − to reduce)" : "New value"} ${unit}`}>
            <input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={mode === "add" ? "e.g. 5 or -3" : "e.g. 108"}
              className={inputCls}
            />
          </Field>
          {(
            [
              ["Presets", pricing.presets, presets, setPresets],
              ["Grades", pricing.groups, groups, setGroups],
            ] as const
          ).map(([label, items, sel, set]) => (
            <div key={label}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {label} · {sel.length}/{items.length}
                </span>
                <span className="flex gap-3 text-xs font-semibold text-primary">
                  <button type="button" onClick={() => set(items.map((x) => x.id))}>
                    Select all
                  </button>
                  <button type="button" onClick={() => set([])}>
                    Clear
                  </button>
                </span>
              </div>
              {multi(items, sel, set)}
            </div>
          ))}
        </div>
        <div className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button className="h-12 w-full rounded-xl text-base font-semibold" onClick={apply}>
            {mode === "add"
              ? `${FIELD_LABELS[field]} ${Number(value) >= 0 ? "+" : ""}${value || "0"}`
              : `Set ${FIELD_LABELS[field]} = ${value || "0"}`}{" "}
            · {presets.length * groups.length} rates
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// Weight chart: every grade's size × PN grid on one page, like the factory chart. View by default;
// "Edit chart" turns all cells into inputs and "Save changes" writes them in one go.
type Adding = {
  grade: string;
  roll: string;
  kind: "size" | "pn";
  size: string;
  inch: string;
  lens: string;
  pn: string;
  pns: string[];
};

function WeightChart({
  products,
  onSaveMany,
  onCreated,
  onAddOther,
}: {
  products: Product[];
  onSaveMany: (changes: { p: Product; weight: number }[]) => Promise<void>;
  onCreated: () => void;
  onAddOther: (cat: "sprinkler" | "fitting") => void;
}) {
  const [editing, setEditing] = useState(false);
  // In-house = your factory weights (what quotes use). IS 4984 is the reference chart, read-only.
  const [basis, setBasis] = useState<"inhouse" | "is">("inhouse");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<Adding | null>(null);
  const [busy, setBusy] = useState(false);
  // New grade table, e.g. PE80: sizes and PNs as comma lists.
  const [table, setTable] = useState<null | {
    grade: string;
    roll: string;
    sizes: string;
    pns: string;
    lens: string;
  }>(null);

  const pipes = products.filter((p) => p.category === "pipe");
  const others = products.filter((p) => p.category !== "pipe");
  const tables = [...new Set(pipes.map((p) => `${p.grade ?? ""}|${p.roll ?? "complete"}`))].map(
    (k) => {
      const [grade, roll] = k.split("|") as [string, string];
      const rows = pipes.filter(
        (p) => (p.grade ?? "") === grade && (p.roll ?? "complete") === roll,
      );
      return {
        key: k,
        grade,
        roll,
        rows,
        sizes: [...new Set(rows.map((p) => p.size_mm ?? 0))].sort((x, y) => x - y),
        pns: [...new Set(rows.map((p) => p.pn ?? ""))].sort((x, y) => pnNumber(x) - pnNumber(y)),
      };
    },
  );
  const isKg = (grade: string, size: number, pn: string) => {
    const sdr = sdrFor(grade, pnNumber(pn));
    return sdr ? pipeKgPerM(size, sdr) : 0;
  };

  const changes = Object.entries(draft)
    .map(([id, v]) => ({ p: products.find((x) => x.id === id)!, weight: Number(v) }))
    .filter(
      (c) =>
        c.p && isFinite(c.weight) && c.weight >= 0 && Math.abs(c.weight - c.p.weight_kg) > 1e-9,
    );

  async function save() {
    if (!changes.length) return void setEditing(false);
    setSaving(true);
    try {
      await onSaveMany(changes);
      toast.success(`Saved ${changes.length} weight${changes.length > 1 ? "s" : ""}`);
      setDraft({});
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message.slice(0, 140) : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  // Delete a whole table, a size row or a PN column. Products used on saved quotes are only hidden.
  async function remove(ids: string[], what: string) {
    if (!ids.length) return;
    if (!confirm(`Delete ${what}? This removes ${ids.length} product${ids.length > 1 ? "s" : ""}.`))
      return;
    setBusy(true);
    try {
      const r = await removeProducts({ data: { ids } });
      onCreated();
      toast.success(
        r.hidden
          ? `Deleted ${r.deleted}; ${r.hidden} used on quotes ${r.hidden > 1 ? "were" : "was"} hidden instead`
          : `Deleted ${r.deleted}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message.slice(0, 140) : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  async function create(
    grade: string,
    roll: string,
    items: { size: number; pn: string; inch: string; lens: string }[],
  ) {
    const rows = pipes.filter((p) => (p.grade ?? "") === grade && (p.roll ?? "complete") === roll);
    const fresh = items.filter(
      (it) => !rows.some((p) => p.size_mm === it.size && p.pn === normalizePn(it.pn)),
    );
    if (!fresh.length) return void toast.error("Those already exist");
    const groupId = pipes.find((p) => p.grade === grade)?.rate_group_id ?? grade;
    setBusy(true);
    try {
      for (const it of fresh) {
        await saveProduct({
          data: newPipe({
            grade,
            roll,
            size: it.size,
            inch: it.inch,
            pn: it.pn,
            lens: it.lens,
            weight: Number(isKg(grade, it.size, it.pn).toFixed(3)),
            groupId,
          }),
        });
      }
      onCreated();
      setAdding(null);
      toast.success(`Added ${fresh.length} pipe${fresh.length > 1 ? "s" : ""}. Check the weights.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message.slice(0, 140) : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  function submitAdd(t: (typeof tables)[number]) {
    if (!adding) return;
    const sample = (size: number) => t.rows.find((p) => p.size_mm === size);
    if (adding.kind === "size") {
      const size = Math.round(Number(adding.size));
      if (!size) return void toast.error("Enter a size in mm");
      if (!adding.pns.length) return void toast.error("Pick at least one PN");
      return void create(
        t.grade,
        t.roll,
        adding.pns.map((pn) => ({ size, pn, inch: adding.inch, lens: adding.lens })),
      );
    }
    const pn = normalizePn(adding.pn);
    if (!pnNumber(pn)) return void toast.error("Enter a PN, e.g. 10");
    create(
      t.grade,
      t.roll,
      t.sizes.map((size) => ({
        size,
        pn,
        inch: sample(size)?.inch ?? "",
        lens: sample(size)?.roll_lengths ?? "",
      })),
    );
  }

  const cellInput = (p: Product) => (
    <input
      aria-label={`${p.name} kg per metre`}
      inputMode="decimal"
      value={draft[p.id] ?? String(p.weight_kg)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft({ ...draft, [p.id]: e.target.value })}
      className={`h-9 w-20 rounded-lg border bg-background px-2 text-right text-sm font-semibold tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${
        draft[p.id] !== undefined && Number(draft[p.id]) !== p.weight_kg
          ? "border-primary bg-primary/5"
          : "border-input"
      }`}
    />
  );

  return (
    <div className="space-y-4">
      <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="radiogroup"
            aria-label="Weight basis"
            className="inline-flex h-8 rounded-lg border border-border bg-background p-0.5"
          >
            {(
              [
                ["inhouse", "In-house"],
                ["is", "IS 4984"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={basis === v}
                onClick={() => {
                  setBasis(v);
                  if (v === "is") {
                    setEditing(false);
                    setDraft({});
                  }
                }}
                className={`rounded-md px-3 text-[13px] font-semibold transition-colors ${
                  basis === v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {basis === "inhouse"
              ? "kg per metre · your factory weights, used on quotes · amber = more than 5% from IS"
              : "kg per metre · IS 4984:2016 reference weights (read-only)"}
          </p>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="h-10 rounded-xl"
              onClick={() => {
                setDraft({});
                setEditing(false);
              }}
            >
              Discard
            </Button>
            <Button className="h-10 rounded-xl px-5 font-semibold" disabled={saving} onClick={save}>
              {saving ? "Saving…" : changes.length ? `Save changes (${changes.length})` : "Done"}
            </Button>
          </div>
        ) : basis === "inhouse" ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-10 rounded-xl"
              onClick={() =>
                setTable({ grade: "", roll: "complete", sizes: "", pns: "", lens: "" })
              }
            >
              <Plus className="mr-1 h-4 w-4" /> New table
            </Button>
            <Button className="h-10 rounded-xl px-5 font-semibold" onClick={() => setEditing(true)}>
              Edit chart
            </Button>
          </div>
        ) : null}
      </div>

      {table && (
        <Card title="New table">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Grade">
              <div className="space-y-2">
                <Chips
                  label="Grade"
                  value={table.grade}
                  onChange={(g) => setTable({ ...table, grade: g })}
                  options={[...new Set(pipes.map((p) => p.grade ?? "").filter(Boolean))].map(
                    (g) => ({ value: g, label: g }),
                  )}
                />
                <input
                  value={table.grade}
                  onChange={(e) => setTable({ ...table, grade: e.target.value.toUpperCase() })}
                  placeholder="or type, e.g. PE80"
                  className={inputCls}
                />
              </div>
            </Field>
            <Field label="Sizes (mm, comma separated)">
              <input
                value={table.sizes}
                onChange={(e) => setTable({ ...table, sizes: e.target.value })}
                placeholder="32, 40, 50, 63, 75"
                className={inputCls}
              />
            </Field>
            <Field label="PN values (comma separated)">
              <input
                value={table.pns}
                onChange={(e) => setTable({ ...table, pns: e.target.value })}
                placeholder="4, 6"
                className={inputCls}
              />
            </Field>
            {table.roll !== "cut" && (
              <Field label="Roll lengths (m)">
                <input
                  value={table.lens}
                  onChange={(e) => setTable({ ...table, lens: e.target.value })}
                  placeholder="100/200"
                  className={inputCls}
                />
              </Field>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Creates every size × PN with IS 4984 weights (edit after). Uses the grade's rate group:{" "}
            {table.grade
              ? (pipes.find((p) => p.grade === table.grade)?.rate_group_id ??
                `${table.grade} (must exist under Pricing)`)
              : "—"}
            .
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" className="h-10 rounded-xl" onClick={() => setTable(null)}>
              Cancel
            </Button>
            <Button
              className="h-10 flex-1 rounded-xl font-semibold"
              disabled={busy}
              onClick={async () => {
                const sizes = table.sizes
                  .split(/[,\s]+/)
                  .map(Number)
                  .filter((n) => Number.isInteger(n) && n > 0);
                const pns = table.pns
                  .split(/[,\s]+/)
                  .map((x) => normalizePn(x))
                  .filter((x) => pnNumber(x) > 0);
                if (!table.grade || !sizes.length || !pns.length)
                  return void toast.error("Enter grade, sizes and PN values");
                const inchOf = (size: number) => pipes.find((p) => p.size_mm === size)?.inch ?? "";
                await create(
                  table.grade,
                  table.roll,
                  sizes.flatMap((size) =>
                    pns.map((pn) => ({ size, pn, inch: inchOf(size), lens: table.lens })),
                  ),
                );
                setTable(null);
              }}
            >
              {busy ? "Creating…" : "Create table"}
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {tables.map((t) => (
          <Card
            key={t.key}
            title={t.grade}
            aside={
              <span className="flex gap-3 text-xs font-semibold text-primary">
                <button
                  type="button"
                  onClick={() =>
                    setAdding({
                      grade: t.grade,
                      roll: t.roll,
                      kind: "size",
                      size: "",
                      inch: "",
                      lens: t.rows.at(-1)?.roll_lengths ?? "",
                      pn: "",
                      pns: t.pns,
                    })
                  }
                >
                  + Size
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAdding({
                      grade: t.grade,
                      roll: t.roll,
                      kind: "pn",
                      size: "",
                      inch: "",
                      lens: "",
                      pn: "",
                      pns: [],
                    })
                  }
                >
                  + PN
                </button>
                {basis === "inhouse" && !editing && (
                  <button type="button" onClick={() => setEditing(true)}>
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  className="text-destructive"
                  onClick={() =>
                    remove(
                      t.rows.map((p) => p.id),
                      `the whole ${t.grade} table`,
                    )
                  }
                >
                  Delete table
                </button>
              </span>
            }
          >
            <table className="w-full tabular-nums">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="py-1 text-left font-semibold">Size</th>
                  {t.pns.map((pn) => (
                    <th key={pn} className="py-1 text-right font-semibold">
                      {pn}
                      {editing && (
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`Delete ${t.grade} ${pn}`}
                          title={`Delete ${pn} for every size`}
                          className="ml-1 align-middle text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            remove(
                              t.rows.filter((p) => p.pn === pn).map((p) => p.id),
                              `${t.grade} ${pn}`,
                            )
                          }
                        >
                          <X className="inline h-3 w-3" />
                        </button>
                      )}
                    </th>
                  ))}
                  {editing && <th className="w-6" />}
                </tr>
              </thead>
              <tbody>
                {t.sizes.map((size) => (
                  <tr key={size} className="border-t border-border/60">
                    <td className="py-1.5 pr-2 text-sm font-semibold">
                      {size} mm{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {t.rows.find((p) => p.size_mm === size)?.inch}
                      </span>
                    </td>
                    {t.pns.map((pn) => {
                      const p = t.rows.find((x) => x.size_mm === size && x.pn === pn);
                      if (!p)
                        return (
                          <td key={pn} className="text-right">
                            <button
                              type="button"
                              disabled={busy}
                              aria-label={`Add ${size} mm ${pn}`}
                              className="rounded-md px-2 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                              onClick={() =>
                                confirm(`Add ${t.grade} ${size} mm ${pn}?`) &&
                                create(t.grade, t.roll, [
                                  {
                                    size,
                                    pn,
                                    inch: t.rows.find((x) => x.size_mm === size)?.inch ?? "",
                                    lens:
                                      t.rows.find((x) => x.size_mm === size)?.roll_lengths ?? "",
                                  },
                                ])
                              }
                            >
                              +
                            </button>
                          </td>
                        );
                      const ref = isWeight(p);
                      const differs =
                        basis === "inhouse" &&
                        ref != null &&
                        Math.abs(ref - p.weight_kg) / ref > 0.05;
                      return (
                        <td key={pn} className="py-1 text-right">
                          {editing ? (
                            <div className="flex justify-end">{cellInput(p)}</div>
                          ) : (
                            <span
                              className={`text-sm font-semibold ${differs ? "text-amber-700" : ""}`}
                            >
                              {fmtNum(basis === "is" ? (ref ?? p.weight_kg) : p.weight_kg, 3)}
                            </span>
                          )}
                          {basis === "inhouse" && ref != null && (
                            <span className="block text-[10px] text-muted-foreground">
                              IS {fmtNum(ref, 3)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    {editing && (
                      <td className="pl-1 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`Delete ${size} mm`}
                          title={`Delete ${size} mm for every PN`}
                          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                          onClick={() =>
                            remove(
                              t.rows.filter((p) => p.size_mm === size).map((p) => p.id),
                              `${t.grade} ${size} mm`,
                            )
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {adding && adding.grade === t.grade && adding.roll === t.roll && (
              <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
                <p className="text-sm font-semibold">
                  {adding.kind === "size"
                    ? `New ${t.grade} size`
                    : `New ${t.grade} pressure class (all sizes)`}{" "}
                  · IS 4984 weights
                </p>
                {adding.kind === "size" ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Size (mm)">
                        <input
                          inputMode="numeric"
                          value={adding.size}
                          onChange={(e) => setAdding({ ...adding, size: e.target.value })}
                          placeholder="125"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Inch">
                        <input
                          value={adding.inch}
                          onChange={(e) => setAdding({ ...adding, inch: e.target.value })}
                          placeholder='5"'
                          className={inputCls}
                        />
                      </Field>
                      {t.roll !== "cut" && (
                        <Field label="Roll lengths">
                          <input
                            value={adding.lens}
                            onChange={(e) => setAdding({ ...adding, lens: e.target.value })}
                            placeholder="50/100"
                            className={inputCls}
                          />
                        </Field>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {t.pns.map((pn) => {
                        const on = adding.pns.includes(pn);
                        return (
                          <button
                            key={pn}
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            onClick={() =>
                              setAdding({
                                ...adding,
                                pns: on ? adding.pns.filter((x) => x !== pn) : [...adding.pns, pn],
                              })
                            }
                            className={`h-10 rounded-xl border px-3 text-sm font-semibold tabular-nums ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
                          >
                            {pn}
                            {Number(adding.size) > 0 && (
                              <span className="ml-1 text-[10px] font-normal opacity-80">
                                {fmtNum(isKg(t.grade, Number(adding.size), pn), 3)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <Field label="PN">
                    <input
                      inputMode="decimal"
                      value={adding.pn}
                      onChange={(e) => setAdding({ ...adding, pn: e.target.value })}
                      placeholder="10"
                      className={inputCls}
                    />
                  </Field>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    className="h-10 rounded-xl"
                    onClick={() => setAdding(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="h-10 flex-1 rounded-xl font-semibold"
                    disabled={busy}
                    onClick={() => submitAdd(t)}
                  >
                    {busy ? "Saving…" : "Add"}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Card title="Sprinkler & fittings · kg per piece">
        <ul className="-my-1 divide-y divide-border/60">
          {others.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate font-medium">{p.name}</span>
              {editing ? (
                cellInput(p)
              ) : (
                <span className="font-semibold tabular-nums">
                  {fmtNum(p.weight_kg, 3)} kg/{UNIT_LABELS[p.unit as Unit]}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-11 rounded-xl"
            onClick={() => onAddOther("sprinkler")}
          >
            <Plus className="mr-1 h-4 w-4" /> Sprinkler size
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-xl"
            onClick={() => onAddOther("fitting")}
          >
            <Plus className="mr-1 h-4 w-4" /> Fitting
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ProductList({
  products,
  loading,
  pricing,
  presetId,
  onPreset,
  rateOf,
  onSaveWeight,
  onEdit,
  onAdd,
  pane,
  selectedId,
}: {
  pane?: React.ReactNode; // desktop right-hand preview / editor
  selectedId?: string;
  products: Product[];
  loading: boolean;
  pricing: Pricing | undefined;
  presetId: string;
  onPreset: (id: string) => void;
  rateOf: (group: string) => number;
  onSaveWeight: (p: Product, v: string) => Promise<void>;
  onEdit: (p: Product) => void;
  onAdd: () => void;
}) {
  const [cat, setCat] = useState<"all" | Category>("all");
  const [q, setQ] = useState("");
  const [withGst, setWithGst] = useState(false);
  const [view, setView] = useState<"list" | "matrix">("list");
  const [sel, setSel] = useState<Set<string>>(new Set()); // ticked products (list view)
  const [deleting, setDeleting] = useState(false);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<null | {
    rows: ImportRow[];
    errors: string[];
    updates: number;
  }>(null);
  const [importing, setImporting] = useState(false);

  function exportCsv() {
    const csv = toCsv([
      CSV_COLS as unknown as string[],
      ...products.map((p) => CSV_COLS.map((c) => p[c])),
    ]);
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `tarko-products-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  }
  async function pickCsv(file: File) {
    const { rows, errors } = parseProductCsv(await file.text());
    const ids = new Set(products.map((p) => p.id));
    setPending({ rows, errors, updates: rows.filter((r) => r.id && ids.has(r.id)).length });
    if (fileRef.current) fileRef.current.value = "";
  }
  async function runImport() {
    if (!pending?.rows.length) return;
    setImporting(true);
    try {
      const { added, updated } = await importProducts({ data: { rows: pending.rows } });
      await qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(`Imported: ${added} added, ${updated} updated`);
      setPending(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message.slice(0, 200) : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const sections = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of products) {
      if (cat !== "all" && p.category !== cat) continue;
      if (q && !`${p.name} ${p.size_mm ?? ""}`.toLowerCase().includes(q.toLowerCase())) continue;
      const k = sectionOf(p);
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()];
  }, [products, cat, q]);

  // Selection: only products that still exist count (they vanish after a delete).
  const visibleIds = sections.flatMap(([, items]) => items.map((p) => p.id));
  const picked = visibleIds.filter((id) => sel.has(id));
  const allIds = new Set(products.map((p) => p.id));
  const chosen = [...sel].filter((id) => allIds.has(id));
  const toggle = (ids: string[], on: boolean) =>
    setSel((cur) => {
      const next = new Set(cur);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  async function deleteChosen() {
    if (!chosen.length) return;
    if (
      !confirm(
        `Delete ${chosen.length} product${chosen.length > 1 ? "s" : ""}? Products used on saved quotes are hidden instead, so those quotes still open.`,
      )
    )
      return;
    setDeleting(true);
    try {
      const r = await removeProducts({ data: { ids: chosen } });
      await qc.invalidateQueries({ queryKey: ["products"] });
      setSel(new Set());
      toast.success(
        r.hidden
          ? `Deleted ${r.deleted}; ${r.hidden} used on quotes ${r.hidden > 1 ? "were" : "was"} hidden instead`
          : `Deleted ${r.deleted}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message.slice(0, 140) : "Could not delete");
    } finally {
      setDeleting(false);
    }
  }
  const tick = (ids: string[], label: string) => {
    const on = ids.length > 0 && ids.every((id) => sel.has(id));
    return (
      <input
        type="checkbox"
        aria-label={label}
        checked={on}
        ref={(el) => {
          if (el) el.indeterminate = !on && ids.some((id) => sel.has(id));
        }}
        onChange={(e) => toggle(ids, e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        className="size-4 cursor-pointer accent-[var(--color-primary)]"
      />
    );
  };

  return (
    <div className="space-y-4">
      {/* phone: stacked; desktop: one compact toolbar row (the table already shows every preset) */}
      <div className="space-y-4 lg:flex lg:flex-wrap lg:items-center lg:gap-2 lg:space-y-0">
        <Button
          className="h-12 w-full shrink-0 rounded-xl text-base font-semibold lg:h-10 lg:w-auto lg:px-4 lg:text-sm"
          onClick={onAdd}
        >
          <Plus className="mr-1 h-5 w-5" /> Add product
        </Button>
        {pricing && pricing.presets.length > 1 && (
          <div className="lg:hidden">
            <Field label="Show prices for preset">
              <Chips
                label="Preset"
                value={presetId}
                onChange={onPreset}
                options={pricing.presets.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
          </div>
        )}
        <input
          placeholder="Search size or name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${inputCls} lg:h-10 lg:w-56`}
        />
        <Chips
          compact
          label="Category"
          value={cat}
          onChange={setCat}
          options={[
            { value: "all" as const, label: "All" },
            ...(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => ({
              value: c,
              label: CATEGORY_LABELS[c],
            })),
          ]}
        />
        <span className="hidden h-6 w-px bg-border lg:block" aria-hidden />
        <div className="hidden lg:block">
          <Chips
            compact
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: "list" as const, label: "List" },
              { value: "matrix" as const, label: "Matrix" },
            ]}
          />
        </div>
        {view === "matrix" && pricing && (
          <div className="hidden lg:block">
            <Chips
              compact
              label="Matrix preset"
              value={presetId}
              onChange={onPreset}
              options={pricing.presets.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
        )}
        <label className="hidden shrink-0 items-center gap-2 text-sm font-medium lg:flex">
          Incl. GST <Switch checked={withGst} onCheckedChange={setWithGst} />
        </label>
        <div className="flex gap-2 lg:ml-auto">
          <BulkHsn products={products} />
          <Button
            variant="outline"
            className="h-10 rounded-xl"
            onClick={exportCsv}
            title="Export CSV"
          >
            <Download className="h-4 w-4 xl:mr-1" />{" "}
            <span className="hidden xl:inline">Export</span>
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-xl"
            onClick={() => fileRef.current?.click()}
            title="Import CSV"
          >
            <Upload className="h-4 w-4 xl:mr-1" /> <span className="hidden xl:inline">Import</span>
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && pickCsv(e.target.files[0])}
          />
        </div>
      </div>

      <Drawer open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Import products</DrawerTitle>
          </DrawerHeader>
          {pending && (
            <div className="space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <p className="text-sm">
                <b>{pending.rows.length}</b> valid rows:{" "}
                <b>{pending.rows.length - pending.updates}</b> new, <b>{pending.updates}</b> updates
                to existing products (matched by id).
              </p>
              {pending.errors.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold">{pending.errors.length} row(s) skipped:</p>
                  <ul className="mt-1 list-disc pl-4">
                    {pending.errors.slice(0, 8).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Columns: {CSV_COLS.join(", ")}. Tip: export first, edit in Excel/Sheets, import
                back. Leave id blank for new products.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="h-12 rounded-xl"
                  onClick={() => setPending(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="h-12 flex-1 rounded-xl font-semibold"
                  disabled={!pending.rows.length || importing}
                  onClick={runImport}
                >
                  {importing ? "Importing…" : `Import ${pending.rows.length} rows`}
                </Button>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
      {chosen.length > 0 && view === "list" && (
        <div className="sticky top-12 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-card px-3 py-2 text-sm shadow-sm">
          <b>{chosen.length} selected</b>
          {picked.length < visibleIds.length && (
            <button
              type="button"
              className="font-semibold text-primary"
              onClick={() => toggle(visibleIds, true)}
            >
              Select all {visibleIds.length}
            </button>
          )}
          <button
            type="button"
            className="font-semibold text-primary"
            onClick={() => setSel(new Set())}
          >
            Clear
          </button>
          <Button
            variant="outline"
            className="ml-auto h-9 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={deleting}
            onClick={deleteChosen}
          >
            <Trash2 className="mr-1 h-4 w-4" /> {deleting ? "Deleting…" : `Delete ${chosen.length}`}
          </Button>
        </div>
      )}
      {loading && <div className="h-64 animate-pulse rounded-2xl bg-secondary" />}
      <div className="lg:hidden space-y-4">
        {sections.map(([title, items]) => (
          <Card
            key={title}
            title={title}
            aside={tick(
              items.map((p) => p.id),
              `Select all in ${title}`,
            )}
          >
            <ul className="-my-1 divide-y divide-border/60">
              {items.map((p) => {
                const rate = rateOf(p.rate_group_id);
                const up = rate * p.weight_kg;
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2">
                    {tick([p.id], `Select ${shortName(p)}`)}
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => onEdit(p)}
                    >
                      <p className="truncate font-medium tabular-nums">{shortName(p)}</p>
                      <p className="truncate text-xs tabular-nums text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {fmtMoney(up)}/{UNIT_LABELS[p.unit as Unit]}
                        </span>{" "}
                        · {fmtMoney(up * (1 + p.gst_rate / 100))} incl. {p.gst_rate}% ·{" "}
                        {fmtMoney(rate)}/kg
                      </p>
                    </button>
                    <WeightCell
                      key={`${p.id}-${p.weight_kg}`}
                      value={p.weight_kg}
                      unit={p.unit as Unit}
                      onSave={(v) => onSaveWeight(p, v)}
                    />
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>

      {/* desktop: whole catalog in one table, every preset's price side by side */}
      <div
        className={`hidden gap-4 lg:grid lg:h-[calc(100vh-12.5rem)] lg:min-h-[28rem] ${pane ? "lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_28rem]" : "lg:grid-cols-1"}`}
      >
        <Card className="min-h-0 overflow-y-auto">
          {view === "matrix" ? (
            <ProductMatrix
              products={products.filter(
                (p) =>
                  (cat === "all" || p.category === cat) &&
                  (!q || `${p.name} ${p.size_mm ?? ""}`.toLowerCase().includes(q.toLowerCase())),
              )}
              rateOf={rateOf}
              withGst={withGst}
              selectedId={selectedId ?? ""}
              onPick={onEdit}
            />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {products.length} products · price = weight × preset ₹/kg
                {withGst ? " · incl. GST" : ""}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full tabular-nums">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="w-7 py-2 pr-1">{tick(visibleIds, "Select all products")}</th>
                      <th className="py-2 pr-3 font-semibold">Product</th>
                      <th className="px-2 font-semibold">Grade</th>
                      <th className="px-2 font-semibold">PN</th>
                      <th className="px-2 font-semibold">Roll</th>
                      <th className="px-2 text-right font-semibold">Weight</th>
                      {pricing?.presets.map((pr) => (
                        <th key={pr.id} className="px-2 text-right font-semibold normal-case">
                          {pr.name}{" "}
                          <span className="font-normal text-muted-foreground">₹/unit</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sections.map(([title, items]) => (
                      <Fragment key={title}>
                        <tr>
                          <td className="pt-4 pb-1 pr-1">
                            {tick(
                              items.map((p) => p.id),
                              `Select all in ${title}`,
                            )}
                          </td>
                          <td
                            colSpan={5 + (pricing?.presets.length ?? 0)}
                            className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-primary"
                          >
                            {title}
                          </td>
                        </tr>
                        {items.map((p) => (
                          <tr
                            key={p.id}
                            onClick={() => onEdit(p)}
                            className={`cursor-pointer border-b border-border/50 ${p.id === selectedId ? "bg-primary/10" : "hover:bg-secondary/40"}`}
                          >
                            <td className="py-1.5 pr-1" onClick={(e) => e.stopPropagation()}>
                              {tick([p.id], `Select ${shortName(p)}`)}
                            </td>
                            <td className="py-1.5 pr-3 text-sm font-medium">{shortName(p)}</td>
                            <td className="px-2 text-sm">{p.grade ?? "—"}</td>
                            <td className="px-2 text-sm">{p.pn ? pnNumber(p.pn) || p.pn : "—"}</td>
                            <td className="whitespace-nowrap px-2 text-sm text-muted-foreground">
                              {p.roll === "cut"
                                ? "cut"
                                : p.roll_lengths
                                  ? `${p.roll_lengths} m`
                                  : "—"}
                            </td>
                            <td className="px-2" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end">
                                <WeightCell
                                  key={`${p.id}-${p.weight_kg}`}
                                  value={p.weight_kg}
                                  unit={p.unit as Unit}
                                  compact
                                  onSave={(v) => onSaveWeight(p, v)}
                                />
                              </div>
                            </td>
                            {pricing?.presets.map((pr) => {
                              const r = pricing.rates.find(
                                (x) => x.preset_id === pr.id && x.group_id === p.rate_group_id,
                              );
                              const up = r
                                ? ratePerKg(r) * p.weight_kg * (withGst ? 1 + p.gst_rate / 100 : 1)
                                : 0;
                              return (
                                <td
                                  key={pr.id}
                                  className={`px-2 text-right text-sm ${pr.id === presetId ? "font-bold" : ""}`}
                                >
                                  {r ? `${fmtNum(up)}/${UNIT_LABELS[p.unit as Unit]}` : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
        {pane && (
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
            {pane}
          </div>
        )}
      </div>
    </div>
  );
}

// Raw material ₹/kg per grade × brand for one profile. Blank = that brand uses the preset's raw price.
function BrandRawCard({
  brands,
  groups,
  rows,
  profileId,
  profileName,
  onSaved,
}: {
  brands: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  rows: { brand_id: string; group_id: string; raw_kg: number; raw_kg_non_isi: number | null }[];
  profileId: string;
  profileName: string;
  onSaved: () => void;
}) {
  const [f, setF] = useState<null | {
    brand: { id: string; name: string };
    group: { id: string; name: string };
    raw: string;
    nonIsi: string;
  }>(null);
  const row = (b: string, g: string) => rows.find((r) => r.brand_id === b && r.group_id === g);
  async function save(clear = false) {
    if (!f) return;
    if (!clear && f.raw.trim() === "")
      return void toast.error("Enter the ISI raw price, or use Clear");
    try {
      await saveBrandRaw({
        data: {
          profile_id: profileId,
          brand_id: f.brand.id,
          group_id: f.group.id,
          raw_kg: clear ? null : Number(f.raw) || 0,
          raw_kg_non_isi: clear || f.nonIsi.trim() === "" ? null : Number(f.nonIsi) || 0,
        },
      });
      onSaved();
      setF(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message.slice(0, 140) : "Could not save");
    }
  }
  return (
    <Card title={`Raw material by brand · ₹/kg · ${profileName}`}>
      <span className="hidden text-xs text-muted-foreground lg:block">
        A brand's raw price replaces the preset raw on its quotes (ISI | Non-ISI).
      </span>
      <p className="-mt-1 text-xs text-muted-foreground lg:hidden">
        Raw price depends on the brand. When set, a quote or price list for that brand uses it
        instead of the preset raw; production, transport and margin still come from the preset. ISI
        | Non-ISI.
      </p>
      <div className="-mx-4 overflow-x-auto px-4 lg:-mx-3 lg:px-3">
        <table className="w-full min-w-[28rem] tabular-nums">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-2 text-left font-semibold uppercase tracking-wide">Grade</th>
              {brands.map((b) => (
                <th key={b.id} className="px-1 py-2 text-right text-sm font-semibold text-primary">
                  {b.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className="border-t border-border/60">
                <td className="py-2 pr-2 text-sm font-medium lg:py-0.5">{g.name}</td>
                {brands.map((b) => {
                  const r = row(b.id, g.id);
                  return (
                    <td key={b.id} className="p-1">
                      <button
                        type="button"
                        className="w-full rounded-lg px-2 py-1.5 text-right hover:bg-secondary lg:py-0.5"
                        onClick={() =>
                          setF({
                            brand: b,
                            group: g,
                            raw: r ? String(r.raw_kg) : "",
                            nonIsi: r?.raw_kg_non_isi != null ? String(r.raw_kg_non_isi) : "",
                          })
                        }
                      >
                        {r ? (
                          <span className="text-sm font-bold">
                            {fmtNum(r.raw_kg)}
                            {r.raw_kg_non_isi != null && (
                              <span className="text-amber-700">
                                {" "}
                                <span className="font-normal text-border">|</span>{" "}
                                {fmtNum(r.raw_kg_non_isi)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">preset raw</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Drawer open={!!f} onOpenChange={(o) => !o && setF(null)}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{f ? `${f.group.name} · ${f.brand.name} raw` : ""}</DrawerTitle>
          </DrawerHeader>
          {f && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
              className="space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <div className="grid grid-cols-2 gap-2">
                <Field label="Raw ₹/kg (ISI)">
                  <input
                    inputMode="decimal"
                    autoFocus
                    value={f.raw}
                    onChange={(e) => setF({ ...f, raw: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Raw ₹/kg (Non-ISI, optional)">
                  <input
                    inputMode="decimal"
                    value={f.nonIsi}
                    onChange={(e) => setF({ ...f, nonIsi: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-xl"
                  onClick={() => save(true)}
                >
                  Clear (use preset raw)
                </Button>
                <Button type="submit" className="h-12 flex-1 rounded-xl text-base font-semibold">
                  Save
                </Button>
              </div>
            </form>
          )}
        </DrawerContent>
      </Drawer>
    </Card>
  );
}

// ----- CSV -----
const CSV_COLS = [
  "id",
  "category",
  "name",
  "grade",
  "roll",
  "size_mm",
  "inch",
  "pn",
  "roll_lengths",
  "unit",
  "weight_kg",
  "gst_rate",
  "hsn",
  "rate_group_id",
] as const;
type ImportRow = Parameters<typeof importProducts>[0]["data"]["rows"][number];

function parseProductCsv(text: string): { rows: ImportRow[]; errors: string[] } {
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  csvObjects(text).forEach((raw, i) => {
    const r = raw as Partial<Record<(typeof CSV_COLS)[number], string>>;
    const line = `Row ${i + 2}`;
    const category = (r.category || "pipe").toLowerCase();
    const unit = (r.unit || (category === "pipe" ? "m" : "pc")).toLowerCase();
    const weight = Number(r.weight_kg);
    const size = r.size_mm ? Number(r.size_mm) : null;
    if (!["pipe", "sprinkler", "fitting"].includes(category))
      return void errors.push(`${line}: category must be pipe, sprinkler or fitting`);
    if (!["m", "pc", "kg"].includes(unit))
      return void errors.push(`${line}: unit must be m, pc or kg`);
    if (!r.name) return void errors.push(`${line}: name is required`);
    if (!r.rate_group_id) return void errors.push(`${line}: rate_group_id is required (e.g. PE63)`);
    if (!isFinite(weight) || weight < 0)
      return void errors.push(`${line}: weight_kg must be a number`);
    if (size != null && (!Number.isInteger(size) || size <= 0))
      return void errors.push(`${line}: size_mm must be a whole number`);
    rows.push({
      ...(r.id ? { id: r.id } : {}),
      category: category as ImportRow["category"],
      unit: unit as ImportRow["unit"],
      name: r.name,
      rate_group_id: r.rate_group_id.toUpperCase(),
      grade: r.grade || null,
      roll: r.roll || null,
      pn: r.pn ? normalizePn(r.pn) : null,
      inch: r.inch || null,
      roll_lengths: r.roll_lengths || null,
      hsn: r.hsn || null,
      size_mm: size,
      weight_kg: weight,
      gst_rate:
        r.gst_rate === "" || r.gst_rate == null
          ? category === "sprinkler"
            ? 5
            : 18
          : Number(r.gst_rate) || 0,
    });
  });
  return { rows, errors };
}

// Matrix view: like the printed price list — size × PN per grade, ₹ per metre for the chosen preset. Click opens the pane.
function ProductMatrix({
  products,
  rateOf,
  withGst,
  selectedId,
  onPick,
}: {
  products: Product[];
  rateOf: (group: string) => number;
  withGst: boolean;
  selectedId: string;
  onPick: (p: Product) => void;
}) {
  const price = (p: Product) =>
    rateOf(p.rate_group_id) * p.weight_kg * (withGst ? 1 + p.gst_rate / 100 : 1);
  const pipes = products.filter((p) => p.category === "pipe");
  const others = products.filter((p) => p.category !== "pipe");
  const tables = [...new Set(pipes.map((p) => `${p.grade ?? ""}|${p.roll ?? "complete"}`))].map(
    (k) => {
      const [grade, roll] = k.split("|") as [string, string];
      const rows = pipes.filter(
        (p) => (p.grade ?? "") === grade && (p.roll ?? "complete") === roll,
      );
      return {
        k,
        grade,
        roll,
        rows,
        sizes: [...new Set(rows.map((p) => p.size_mm ?? 0))].sort((a, b) => a - b),
        pns: [...new Set(rows.map((p) => p.pn ?? ""))].sort((a, b) => pnNumber(a) - pnNumber(b)),
      };
    },
  );
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        ₹ per metre{withGst ? ", incl. GST" : ", ex-GST"} · small figure = kg/m · click a cell to
        edit
      </p>
      <div className="grid gap-5 2xl:grid-cols-2">
        {tables.map((t) => (
          <table key={t.k} className="w-full self-start tabular-nums">
            <thead>
              <tr>
                <th
                  colSpan={1 + t.pns.length}
                  className="pb-1 text-left text-xs font-semibold uppercase tracking-wider text-primary"
                >
                  {t.grade}
                </th>
              </tr>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-1 text-left font-semibold">Size</th>
                {t.pns.map((pn) => (
                  <th key={pn} className="py-1 text-right font-semibold">
                    PN {pnNumber(pn) || pn}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.sizes.map((size) => (
                <tr key={size} className="border-b border-border/50">
                  <td className="py-1 pr-2 text-sm font-semibold">
                    {size}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {t.rows.find((p) => p.size_mm === size)?.inch}
                    </span>
                  </td>
                  {t.pns.map((pn) => {
                    const p = t.rows.find((x) => x.size_mm === size && x.pn === pn);
                    return (
                      <td key={pn} className="p-0.5 text-right">
                        {p ? (
                          <button
                            type="button"
                            onClick={() => onPick(p)}
                            className={`w-full rounded-md px-2 py-1 text-right ${p.id === selectedId ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
                          >
                            <span className="block text-sm font-semibold">{fmtNum(price(p))}</span>
                            <span
                              className={`block text-[10px] ${p.id === selectedId ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                            >
                              {fmtNum(p.weight_kg, 3)}
                            </span>
                          </button>
                        ) : (
                          <span className="px-2 text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      {others.length > 0 && (
        <table className="w-full tabular-nums">
          <thead>
            <tr>
              <th
                colSpan={2}
                className="pb-1 text-left text-xs font-semibold uppercase tracking-wider text-primary"
              >
                Sprinkler & fittings
              </th>
            </tr>
          </thead>
          <tbody>
            {others.map((p) => (
              <tr
                key={p.id}
                onClick={() => onPick(p)}
                className={`cursor-pointer border-b border-border/50 ${p.id === selectedId ? "bg-primary/10" : "hover:bg-secondary/50"}`}
              >
                <td className="py-1.5 text-sm">{p.name}</td>
                <td className="text-right text-sm font-semibold">
                  ₹{fmtNum(price(p))}/{UNIT_LABELS[p.unit as Unit]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Price of one product under every preset (ex-GST and incl. GST), shown in the desktop pane.
function PresetPreview({
  product,
  pricing,
}: {
  product: ProductForm;
  pricing: Pricing | undefined;
}) {
  const w = Number(product.weight) || 0;
  const unit = UNIT_LABELS[(product.unit ?? "m") as Unit];
  const gst = product.gst_rate ?? 18;
  if (!pricing) return null;
  return (
    <div className="mx-4 mt-3 overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-secondary/60 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 text-left font-semibold">Preset</th>
            <th className="px-2 text-right font-semibold">₹/kg</th>
            <th className="px-2 text-right font-semibold">₹/{unit}</th>
            <th className="px-3 text-right font-semibold">incl. {gst}%</th>
          </tr>
        </thead>
        <tbody>
          {pricing.presets.map((pr) => {
            const r = pricing.rates.find(
              (x) => x.preset_id === pr.id && x.group_id === product.rate_group_id,
            );
            const kg = r ? ratePerKg(r) : 0;
            return (
              <tr key={pr.id} className="border-t border-border/60">
                <td className="px-3 py-1.5 font-medium">{pr.name}</td>
                <td className="px-2 text-right text-muted-foreground">{r ? fmtNum(kg) : "—"}</td>
                <td className="px-2 text-right font-semibold">{r ? fmtNum(kg * w) : "—"}</td>
                <td className="px-3 text-right">{r ? fmtNum(kg * w * (1 + gst / 100)) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Inline weight edit; saves on blur/Enter.
function WeightCell({
  value,
  unit,
  compact,
  onSave,
}: {
  value: number;
  unit: Unit;
  compact?: boolean;
  onSave: (v: string) => Promise<void>;
}) {
  const [v, setV] = useState(String(value));
  const [saved, setSaved] = useState(false);
  const commit = async () => {
    if (v === String(value)) return;
    await onSave(v);
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };
  return (
    <div className={`relative shrink-0 ${compact ? "mx-auto w-20" : "w-28"}`}>
      <input
        aria-label={`Weight kg per ${UNIT_LABELS[unit]}`}
        inputMode="decimal"
        value={v}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={`${inputCls} h-11 text-right font-semibold ${compact ? "px-2 pr-6 text-sm" : "pr-14"}`}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        {saved ? (
          <Check className="h-4 w-4 text-emerald-600" />
        ) : compact ? (
          ""
        ) : (
          `kg/${UNIT_LABELS[unit]}`
        )}
      </span>
    </div>
  );
}
