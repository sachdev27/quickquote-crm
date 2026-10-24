import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Calculator,
  Check,
  CirclePercent,
  Copy,
  ExternalLink,
  Layers,
  RotateCcw,
  Scale,
  Search,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PipeSection } from "@/components/pipe-section";
import { FittingDrawing } from "@/components/fitting-drawing";
import { pipeSpec } from "@/lib/pipe-spec";
import {
  fmtMoney,
  fmtNum,
  inWords,
  rateKgFor,
  withBrandRaw,
  type Brand,
  type Category,
  type Rate,
  type Unit,
  SPRINKLER_GROUP,
} from "@/lib/quote";
import { isSpec } from "@/lib/is4984";
import { productQueryFilter } from "@/lib/product-search";
import { pnNumber, sdrFor } from "@/lib/weights";
import type { listPricing, listProducts } from "@/data/api";

type Product = Awaited<ReturnType<typeof listProducts>>[number];
type Pricing = Awaited<ReturnType<typeof listPricing>>;

interface PricePlaygroundProps {
  products: Product[];
  pricing: Pricing;
  brands: Brand[];
  initialBrandId?: string | undefined;
  initialPresetId?: string | undefined;
  initialProfileId?: string | undefined;
}

const COMMON_ODS = [20, 25, 32, 40, 50, 63, 75, 90, 110, 125, 140, 160, 200, 250, 280, 315];
const COMMON_PNS = ["PN 2.5", "PN 4", "PN 6", "PN 8", "PN 10", "PN 12.5", "PN 16", "PN 20"];
const STANDARD_ROLLS = [100, 200, 300, 500, 1000];

export function PricePlayground({
  products,
  pricing,
  brands,
  initialBrandId,
  initialPresetId,
  initialProfileId,
}: PricePlaygroundProps) {
  const navigate = useNavigate();

  // Active pricing scope
  const [profileId, setProfileId] = useState(
    initialProfileId || pricing.activeProfileId || pricing.profiles[0]?.id || "",
  );
  const [brandId, setBrandId] = useState(initialBrandId || brands[0]?.id || "");
  const [presetId, setPresetId] = useState(initialPresetId || pricing.presets[0]?.id || "");
  const [nonIsi, setNonIsi] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | "pipe" | "sprinkler" | "fitting">("all");
  const [grade, setGrade] = useState<string>("all");
  const [selectedOd, setSelectedOd] = useState<number | "all">("all");
  const [selectedPn, setSelectedPn] = useState<string | "all">("all");

  // Selected product ID
  const [selectedProductId, setSelectedProductId] = useState<string>("");

  // Quantity / Roll estimator
  const [qty, setQty] = useState<number>(100);
  const [gstRate, setGstRate] = useState<number>(18);
  const [customDiscount, setCustomDiscount] = useState<number>(0);
  const [copied, setCopied] = useState<string | null>(null);

  // Helper to find raw rates
  const currentRates = useMemo(() => {
    return pricing.rates.filter((r) => r.profile_id === profileId);
  }, [pricing.rates, profileId]);

  const brandRawMap = useMemo(() => {
    const map = new Map<string, { raw_kg: number; raw_kg_non_isi: number | null }>();
    for (const b of pricing.brandRaw) {
      if (b.profile_id === profileId && b.brand_id === brandId) {
        map.set(b.group_id, { raw_kg: b.raw_kg, raw_kg_non_isi: b.raw_kg_non_isi });
      }
    }
    return map;
  }, [pricing.brandRaw, profileId, brandId]);

  // Compute rate for any group and preset
  const computeProductRate = (
    rateGroupId: string | null,
    weightKg: number,
    targetPresetId = presetId,
  ): {
    rateKg: number;
    baseRate: Rate | null;
    effectiveRate: Rate | null;
    brandOverride: boolean;
  } => {
    if (!rateGroupId) {
      return { rateKg: 0, baseRate: null, effectiveRate: null, brandOverride: false };
    }
    const r = currentRates.find(
      (x) => x.preset_id === targetPresetId && x.group_id === rateGroupId,
    );
    if (!r) {
      return { rateKg: 0, baseRate: null, effectiveRate: null, brandOverride: false };
    }
    const bRaw = brandRawMap.get(rateGroupId);
    const eff = withBrandRaw(r, bRaw);
    const rateKg = rateKgFor(eff, rateGroupId, weightKg, nonIsi);
    return {
      rateKg,
      baseRate: r,
      effectiveRate: eff,
      brandOverride: !!bRaw,
    };
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    const matchesQuery = productQueryFilter(search);
    return products.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (grade !== "all" && p.grade !== grade) return false;
      if (selectedOd !== "all" && p.size_mm !== selectedOd) return false;
      if (selectedPn !== "all" && p.pn !== selectedPn) return false;

      return matchesQuery(p);
    });
  }, [products, category, grade, selectedOd, selectedPn, search]);

  // Active product
  const activeProduct = useMemo(() => {
    if (selectedProductId) {
      const found = products.find((p) => p.id === selectedProductId);
      if (found) return found;
    }
    return filteredProducts[0] || null;
  }, [selectedProductId, products, filteredProducts]);

  // Calculate pricing for active product
  const activePricing = useMemo(() => {
    if (!activeProduct) return null;
    const { rateKg, baseRate, effectiveRate, brandOverride } = computeProductRate(
      activeProduct.rate_group_id,
      activeProduct.weight_kg,
      presetId,
    );

    // Calculate unit price (ex-GST)
    const unitPriceEx = activeProduct.weight_kg > 0 ? activeProduct.weight_kg * rateKg : 0;
    const discountedUnitEx = unitPriceEx * (1 - customDiscount / 100);
    const gstAmount = discountedUnitEx * (gstRate / 100);
    const unitPriceInc = discountedUnitEx + gstAmount;

    // Pipe spec if applicable
    const spec = pipeSpec({
      category: activeProduct.category as Category,
      description: activeProduct.name,
      unit: activeProduct.unit as Unit,
      weightKg: activeProduct.weight_kg,
    });

    // IS 4984 chart wall thickness range
    const isChartWall =
      activeProduct.grade && activeProduct.size_mm && activeProduct.pn
        ? isSpec(
            activeProduct.size_mm,
            sdrFor(activeProduct.grade, pnNumber(activeProduct.pn)) ?? 0,
          )
        : null;

    // Totals for custom quantity
    const totalWeight = activeProduct.weight_kg * qty;
    const totalTaxable = discountedUnitEx * qty;
    const totalGst = totalTaxable * (gstRate / 100);
    const totalGross = totalTaxable + totalGst;

    return {
      rateKg,
      baseRate,
      effectiveRate,
      brandOverride,
      unitPriceEx,
      discountedUnitEx,
      gstAmount,
      unitPriceInc,
      spec,
      isChartWall,
      totalWeight,
      totalTaxable,
      totalGst,
      totalGross,
    };
  }, [activeProduct, presetId, computeProductRate, customDiscount, gstRate, qty]);

  // Comparison across all presets for the active product
  const presetComparisons = useMemo(() => {
    if (!activeProduct) return [];
    return pricing.presets.map((preset) => {
      const { rateKg } = computeProductRate(
        activeProduct.rate_group_id,
        activeProduct.weight_kg,
        preset.id,
      );
      const unitEx = activeProduct.weight_kg > 0 ? activeProduct.weight_kg * rateKg : 0;
      const unitInc = unitEx * (1 + gstRate / 100);
      const roll100 = unitEx * 100;
      const roll100Inc = roll100 * (1 + gstRate / 100);
      return {
        preset,
        isCurrent: preset.id === presetId,
        rateKg,
        unitEx,
        unitInc,
        roll100,
        roll100Inc,
      };
    });
  }, [activeProduct, pricing.presets, computeProductRate, presetId, gstRate]);

  // Brand object
  const currentBrand = brands.find((b) => b.id === brandId);
  const currentProfile = pricing.profiles.find((p) => p.id === profileId);
  const currentPreset = pricing.presets.find((p) => p.id === presetId);

  // Copy helper
  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(null), 2000);
  };

  // WhatsApp summary text
  const generateWhatsAppMessage = () => {
    if (!activeProduct || !activePricing) return "";
    const lines = [
      `*${activeProduct.name}*`,
      `Brand: ${currentBrand?.name || "Standard"} · Preset: ${currentPreset?.name || "Standard"} (${nonIsi ? "Non-ISI" : "ISI"})`,
      `───────────────────────`,
      `• Rate: *${fmtMoney(activePricing.discountedUnitEx)}/${activeProduct.unit}* (Ex-GST)`,
      `• Rate with ${gstRate}% GST: *${fmtMoney(activePricing.unitPriceInc)}/${activeProduct.unit}*`,
      `• Rate per kg: ${fmtMoney(activePricing.rateKg)}/kg`,
      `• Weight: ${fmtNum(activeProduct.weight_kg, 3)} kg/${activeProduct.unit}`,
    ];

    if (activeProduct.category === "pipe") {
      lines.push(
        `• 100m Coil: ${fmtMoney(activePricing.discountedUnitEx * 100)} + GST = *${fmtMoney(activePricing.discountedUnitEx * 100 * (1 + gstRate / 100))}*`,
        `• 500m Coil: ${fmtMoney(activePricing.discountedUnitEx * 500)} + GST = *${fmtMoney(activePricing.discountedUnitEx * 500 * (1 + gstRate / 100))}*`,
      );
    }

    if (qty > 0 && qty !== 100) {
      lines.push(
        `───────────────────────`,
        `Estimated for *${fmtNum(qty)} ${activeProduct.unit}*:`,
        `• Taxable: ${fmtMoney(activePricing.totalTaxable)}`,
        `• Total with GST: *${fmtMoney(activePricing.totalGross)}*`,
      );
    }

    lines.push(`Generated by Tarko CRM`);
    return lines.join("\n");
  };

  // Reset all quick filters
  const resetFilters = () => {
    setSearch("");
    setCategory("all");
    setGrade("all");
    setSelectedOd("all");
    setSelectedPn("all");
  };

  return (
    <div className="space-y-4">
      {/* 1. TOP CONTROL BAR: Profile, Brand, Preset, ISI toggle */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Profile & Period */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Period
            </span>
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              className="h-9 rounded-xl border border-border bg-background px-3 text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-hidden"
            >
              {pricing.profiles.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.name} {pr.id === pricing.activeProfileId ? "· Active" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Brand Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-1">
              Brand:
            </span>
            {brands.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBrandId(b.id)}
                className={`inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-semibold transition-all ${
                  brandId === b.id
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>

          {/* Preset Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-1">
              Preset:
            </span>
            {pricing.presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPresetId(p.id)}
                className={`inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-semibold transition-all ${
                  presetId === p.id
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* ISI / Non-ISI Switch */}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-1">
            <span
              className={`text-xs font-semibold ${!nonIsi ? "text-primary" : "text-muted-foreground"}`}
            >
              ISI
            </span>
            <Switch checked={nonIsi} onCheckedChange={setNonIsi} aria-label="Toggle Non-ISI" />
            <span
              className={`text-xs font-semibold ${nonIsi ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
            >
              Non-ISI
            </span>
          </div>
        </div>
      </div>

      {/* 2. INSTANT SEARCH & RAPID FILTERS */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
        {/* Search Bar with count badge */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Instant search: OD PN grade, e.g. 63 6 pe63 · 110 10 cut · coupler 50..."
              className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-9 text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-hidden"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              {filteredProducts.length} of {products.length} products
            </span>
            {(search ||
              category !== "all" ||
              grade !== "all" ||
              selectedOd !== "all" ||
              selectedPn !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-8 rounded-lg text-xs gap-1 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </Button>
            )}
          </div>
        </div>

        {/* Category & Grade Quick Selectors */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
          {/* Category Chips */}
          <div className="flex items-center gap-1">
            {(
              [
                { id: "all", label: "All items" },
                { id: "pipe", label: "HDPE Pipe" },
                { id: "sprinkler", label: "Sprinkler" },
                { id: "fitting", label: "Fittings" },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`h-7 rounded-lg px-2.5 text-xs font-medium transition-all ${
                  category === c.id
                    ? "bg-secondary text-foreground font-semibold border border-primary/40 shadow-2xs"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Grade Chips (for pipe/sprinkler) */}
          {(category === "all" || category === "pipe") && (
            <>
              <div className="h-4 w-px bg-border mx-1" />
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">
                  Grade:
                </span>
                {["all", "PE63", "PE80", "PE100"].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGrade(g)}
                    className={`h-7 rounded-lg px-2 text-xs transition-all ${
                      grade === g
                        ? "bg-primary/10 text-primary font-bold border border-primary/30"
                        : "text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    {g === "all" ? "All" : g}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Quick Size (OD) Buttons (when looking at pipes/all) */}
        {(category === "all" || category === "pipe") && (
          <div className="space-y-1.5 pt-1 border-t border-border/40">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Quick Size (OD mm):
              </span>
              {selectedOd !== "all" && (
                <button
                  type="button"
                  onClick={() => setSelectedOd("all")}
                  className="text-[11px] text-primary hover:underline"
                >
                  Clear size
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs scrollbar-thin">
              <button
                type="button"
                onClick={() => setSelectedOd("all")}
                className={`h-7 px-2 rounded-lg font-medium shrink-0 ${
                  selectedOd === "all"
                    ? "bg-secondary font-semibold text-foreground border border-border"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                All
              </button>
              {COMMON_ODS.map((od) => (
                <button
                  key={od}
                  type="button"
                  onClick={() => setSelectedOd(od === selectedOd ? "all" : od)}
                  className={`h-7 px-2.5 rounded-lg font-medium shrink-0 transition-all ${
                    selectedOd === od
                      ? "bg-primary text-primary-foreground font-bold shadow-2xs"
                      : "border border-border/80 bg-background text-foreground/80 hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {od} mm
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Pressure (PN) Buttons */}
        {(category === "all" || category === "pipe") && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 text-xs border-t border-border/40">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1 shrink-0">
              Pressure (PN):
            </span>
            <button
              type="button"
              onClick={() => setSelectedPn("all")}
              className={`h-7 px-2 rounded-lg font-medium shrink-0 ${
                selectedPn === "all"
                  ? "bg-secondary font-semibold text-foreground border border-border"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              All
            </button>
            {COMMON_PNS.map((pn) => (
              <button
                key={pn}
                type="button"
                onClick={() => setSelectedPn(pn === selectedPn ? "all" : pn)}
                className={`h-7 px-2.5 rounded-lg font-medium shrink-0 transition-all ${
                  selectedPn === pn
                    ? "bg-primary text-primary-foreground font-bold shadow-2xs"
                    : "border border-border/80 bg-background text-foreground/80 hover:bg-muted hover:text-foreground"
                }`}
              >
                {pn}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3. MAIN WORKSPACE: Dual Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1.8fr] gap-4 items-start">
        {/* LEFT COLUMN: Fast Results List */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                Matches ({filteredProducts.length})
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">Click to extract price</span>
          </div>

          <div className="max-h-[640px] overflow-y-auto divide-y divide-border/60">
            {filteredProducts.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <p>No products match your current filters.</p>
                <Button variant="outline" size="sm" onClick={resetFilters} className="mt-3">
                  Reset filters
                </Button>
              </div>
            ) : (
              filteredProducts.map((p) => {
                const isSelected = activeProduct?.id === p.id;
                const { rateKg } = computeProductRate(p.rate_group_id, p.weight_kg);
                const unitEx = p.weight_kg > 0 ? p.weight_kg * rateKg : 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProductId(p.id)}
                    className={`w-full text-left p-3 transition-colors flex items-center justify-between gap-3 ${
                      isSelected
                        ? "bg-primary/10 border-l-4 border-primary pl-2.5"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={`text-sm truncate ${isSelected ? "font-bold text-primary" : "font-semibold text-foreground"}`}
                        >
                          {p.name}
                        </p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {p.grade && (
                          <span className="rounded bg-muted px-1.5 py-0.2 font-medium">
                            {p.grade}
                          </span>
                        )}
                        {p.pn && (
                          <span className="rounded bg-muted px-1.5 py-0.2 font-medium">{p.pn}</span>
                        )}
                        {p.weight_kg > 0 && (
                          <span>
                            {fmtNum(p.weight_kg, 3)} kg/{p.unit}
                          </span>
                        )}
                        {p.hsn && <span>HSN: {p.hsn}</span>}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-foreground">
                        {unitEx > 0 ? `${fmtMoney(unitEx)}/${p.unit}` : "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {rateKg > 0 ? `${fmtMoney(rateKg)}/kg` : ""}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: The Extractor & Calculator Playground */}
        {activeProduct && activePricing ? (
          <div className="space-y-4">
            {/* 3A. HERO PRICE CARD */}
            <div className="rounded-2xl border-2 border-primary/30 bg-card p-5 shadow-sm space-y-4">
              {/* Product header & Badges */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-border/80 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">
                      {activeProduct.category}
                    </span>
                    {activeProduct.grade && (
                      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">
                        {activeProduct.grade}
                      </span>
                    )}
                    {activeProduct.pn && (
                      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">
                        {activeProduct.pn}
                      </span>
                    )}
                    {nonIsi && (
                      <span className="inline-flex items-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-xs font-semibold">
                        Non-ISI
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-foreground">{activeProduct.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    Brand: <strong className="text-foreground">{currentBrand?.name}</strong> ·
                    Preset: <strong className="text-foreground">{currentPreset?.name}</strong> ·
                    Group:{" "}
                    <strong className="text-foreground">{activeProduct.rate_group_id}</strong>
                  </p>
                </div>

                {/* Quick Action buttons */}
                <div className="flex items-center gap-1.5 self-start">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(generateWhatsAppMessage(), "whatsapp")}
                    className="h-8 gap-1.5 text-xs rounded-xl"
                    title="Copy formatted WhatsApp quote"
                  >
                    {copied === "whatsapp" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Share2 className="h-3.5 w-3.5 text-primary" />
                    )}
                    <span>Copy for WhatsApp</span>
                  </Button>

                  <Link
                    to="/new-quote"
                    className="inline-flex h-8 items-center gap-1 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <span>Use in Quote</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>

              {/* Big Price Highlight Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Rate Ex-GST */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-center">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Ex-GST Rate
                  </div>
                  <div className="mt-1 text-xl sm:text-2xl font-black text-primary">
                    {fmtMoney(activePricing.discountedUnitEx)}
                    <span className="text-xs font-normal text-muted-foreground">
                      /{activeProduct.unit}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">Base Unit Price</div>
                </div>

                {/* Rate Incl. GST */}
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Incl. {gstRate}% GST
                  </div>
                  <div className="mt-1 text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300">
                    {fmtMoney(activePricing.unitPriceInc)}
                    <span className="text-xs font-normal text-muted-foreground">
                      /{activeProduct.unit}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    +{fmtMoney(activePricing.gstAmount)} tax
                  </div>
                </div>

                {/* Rate per kg */}
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-center">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Rate per kg
                  </div>
                  <div className="mt-1 text-lg sm:text-xl font-bold text-foreground">
                    {fmtMoney(activePricing.rateKg)}
                    <span className="text-xs font-normal text-muted-foreground">/kg</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {activePricing.brandOverride ? "Brand raw applied" : "Preset raw"}
                  </div>
                </div>

                {/* Weight */}
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-center">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Weight
                  </div>
                  <div className="mt-1 text-lg sm:text-xl font-bold text-foreground">
                    {fmtNum(activeProduct.weight_kg, 3)}
                    <span className="text-xs font-normal text-muted-foreground">
                      {" "}
                      kg/{activeProduct.unit}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {activePricing.spec?.sdr
                      ? `SDR ${fmtNum(activePricing.spec.sdr, 1)}`
                      : "Standard"}
                  </div>
                </div>
              </div>

              {/* Drawing & Specifications for Pipes */}
              {activePricing.spec && (
                <div className="flex flex-col sm:flex-row items-center gap-4 rounded-xl border border-border/80 bg-muted/20 p-3.5">
                  <div className="shrink-0">
                    <PipeSection spec={activePricing.spec} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs w-full">
                    <div>
                      <span className="text-muted-foreground">Outer Diameter:</span>{" "}
                      <strong className="text-foreground">{activePricing.spec.od} mm</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Inside Diameter:</span>{" "}
                      <strong className="text-foreground">
                        {activePricing.spec.id ? `${fmtNum(activePricing.spec.id, 1)} mm` : "—"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Wall Thickness:</span>{" "}
                      <strong className="text-foreground">
                        {activePricing.spec.wall
                          ? `${fmtNum(activePricing.spec.wall, 1)}${activePricing.spec.wallMax ? `–${fmtNum(activePricing.spec.wallMax, 1)}` : ""} mm`
                          : "—"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">SDR Standard:</span>{" "}
                      <strong className="text-foreground">
                        {activePricing.spec.sdr
                          ? `SDR ${fmtNum(activePricing.spec.sdr, 1)}`
                          : "IS 4984"}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Transparent Cost Formula Breakdown */}
              {activePricing.effectiveRate && (
                <div className="rounded-xl border border-border bg-card p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                    <span>Cost Formula Calculation</span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          `Raw: ₹${activePricing.effectiveRate?.raw_kg} + Prod: ₹${activePricing.effectiveRate?.production_kg} + Transport: ₹${activePricing.effectiveRate?.transport_kg} + Margin: ${activePricing.effectiveRate?.margin_is_pct ? `${activePricing.effectiveRate?.margin}%` : `₹${activePricing.effectiveRate?.margin}`} = ₹${activePricing.rateKg}/kg × ${activeProduct.weight_kg} kg = ₹${activePricing.unitPriceEx}/m`,
                          "formula",
                        )
                      }
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Copy className="h-3 w-3" /> Copy formula
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground font-mono text-[11px]">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                      Raw ₹
                      {nonIsi && activePricing.effectiveRate.raw_kg_non_isi != null
                        ? activePricing.effectiveRate.raw_kg_non_isi
                        : activePricing.effectiveRate.raw_kg}
                      /kg
                    </span>
                    <span>+</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                      Prod ₹{activePricing.effectiveRate.production_kg}
                    </span>
                    <span>+</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                      Transport ₹{activePricing.effectiveRate.transport_kg}
                    </span>
                    <span>+</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                      Margin{" "}
                      {activePricing.effectiveRate.margin_is_pct
                        ? `${activePricing.effectiveRate.margin}%`
                        : `₹${activePricing.effectiveRate.margin}`}
                    </span>
                    <span>=</span>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-bold text-primary">
                      ₹{fmtNum(activePricing.rateKg, 2)}/kg
                    </span>
                    <span>×</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                      {fmtNum(activeProduct.weight_kg, 3)} kg/{activeProduct.unit}
                    </span>
                    <span>=</span>
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 font-bold text-primary">
                      {fmtMoney(activePricing.unitPriceEx)}/{activeProduct.unit}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 3B. MULTI-PRESET COMPARISON TABLE */}
            <div className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">
                    All Presets Comparison for this Product
                  </h3>
                </div>
                <span className="text-xs text-muted-foreground">Instant tier rates</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground font-semibold">
                      <th className="py-2 px-3">Preset</th>
                      <th className="py-2 px-3 text-right">Rate / kg</th>
                      <th className="py-2 px-3 text-right">Ex-GST Price</th>
                      <th className="py-2 px-3 text-right">Incl. {gstRate}% GST</th>
                      <th className="py-2 px-3 text-right">100m Coil (Ex-GST)</th>
                      <th className="py-2 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {presetComparisons.map((c) => (
                      <tr
                        key={c.preset.id}
                        className={`${c.isCurrent ? "bg-primary/5 font-semibold" : "hover:bg-muted/30"}`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-foreground">{c.preset.name}</span>
                            {c.isCurrent && (
                              <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                                Current
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground">
                          {fmtMoney(c.rateKg)}/kg
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-foreground">
                          {fmtMoney(c.unitEx)}/{activeProduct.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {fmtMoney(c.unitInc)}/{activeProduct.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground">
                          {activeProduct.category === "pipe" ? fmtMoney(c.roll100) : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {!c.isCurrent && (
                            <button
                              type="button"
                              onClick={() => setPresetId(c.preset.id)}
                              className="text-xs text-primary font-medium hover:underline"
                            >
                              Select
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3C. COIL / ROLL & ORDER QUANTITY EXTRACTOR */}
            <div className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-border/80 pb-2">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">
                    Coil & Order Price Extractor
                  </h3>
                </div>
                <span className="text-xs text-muted-foreground">Live quantity calculator</span>
              </div>

              {/* Standard Coil Quick Chips (for pipes) */}
              {activeProduct.category === "pipe" && (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Quick Coil Length:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {STANDARD_ROLLS.map((len) => {
                      const rollEx = activePricing.discountedUnitEx * len;
                      const rollInc = rollEx * (1 + gstRate / 100);
                      const rollWeight = activeProduct.weight_kg * len;
                      const isSelected = qty === len;
                      return (
                        <button
                          key={len}
                          type="button"
                          onClick={() => setQty(len)}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-xs ring-2 ring-primary/20"
                              : "border-border bg-background hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-foreground">{len} Metres</span>
                            <span className="text-[10px] text-muted-foreground">
                              {fmtNum(rollWeight, 1)} kg
                            </span>
                          </div>
                          <div className="mt-1 font-extrabold text-sm text-primary">
                            {fmtMoney(rollEx)}
                          </div>
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                            {fmtMoney(rollInc)} inc. GST
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Custom Quantity & Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {/* Custom Quantity Input */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Quantity ({activeProduct.unit}):
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-bold text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-hidden"
                  />
                </div>

                {/* GST Rate */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">GST % Rate:</label>
                  <select
                    value={gstRate}
                    onChange={(e) => setGstRate(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-hidden"
                  >
                    <option value={18}>18% (Standard Pipe/Sprinkler)</option>
                    <option value={12}>12% (Agricultural/Specific)</option>
                    <option value={5}>5%</option>
                    <option value={0}>0% (Exempt)</option>
                  </select>
                </div>

                {/* Optional Custom Discount/Markup % */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Discount / Margin Adj. (%):
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={customDiscount}
                    onChange={(e) => setCustomDiscount(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Live Quotation Extracted Total */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-primary/20 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Extracted Quote for {fmtNum(qty)} {activeProduct.unit}:
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Total Weight: <strong>{fmtNum(activePricing.totalWeight, 2)} kg</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                  <div>
                    <span className="text-muted-foreground">Taxable Value:</span>
                    <div className="text-base font-bold text-foreground">
                      {fmtMoney(activePricing.totalTaxable)}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">CGST ({gstRate / 2}%):</span>
                    <div className="text-base font-medium text-muted-foreground">
                      {fmtMoney(activePricing.totalGst / 2)}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">SGST ({gstRate / 2}%):</span>
                    <div className="text-base font-medium text-muted-foreground">
                      {fmtMoney(activePricing.totalGst / 2)}
                    </div>
                  </div>
                  <div className="text-right sm:text-left">
                    <span className="text-muted-foreground">Total Payable:</span>
                    <div className="text-xl font-black text-primary">
                      {fmtMoney(activePricing.totalGross)}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground pt-1 border-t border-primary/10">
                  <em>In Words:</em> Indian Rupees{" "}
                  {inWords(activePricing.totalGross).replace(/ Rupees Only$/, "")} Only
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
            <p>Select a product from the list to extract its price.</p>
          </div>
        )}
      </div>
    </div>
  );
}
