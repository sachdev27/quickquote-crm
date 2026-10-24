import { Calculator } from "lucide-react";
import { toast } from "sonner";
import { Chips, Field, inputCls } from "@/components/qq";
import { Button } from "@/components/ui/button";
import type { ProductForm } from "@/lib/product-form";
import {
  CATEGORY_LABELS,
  GST_OPTIONS,
  UNIT_LABELS,
  fmtMoney,
  fmtNum,
  type Category,
  type Rate,
  type Unit,
} from "@/lib/quote";
import { pipeKgPerM, pnNumber, sdrFor } from "@/lib/weights";

const n = (s: string) => Number(s) || 0;

// The product fields, shared by the Products page and the quote's "edit / duplicate product" sheet.
// rateOf / sprinklerRate price the product with the caller's preset ("basis") and the product's brand.
export function ProductFields({
  prod,
  setProd,
  groups,
  brands,
  basis,
  rateOf,
  sprinklerRate,
}: {
  prod: ProductForm;
  setProd: (p: ProductForm) => void;
  groups: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  basis: string;
  rateOf: (group: string, weightKg?: number, brandId?: string | null) => number;
  sprinklerRate: (brandId?: string | null) => Rate | undefined;
}) {
  const brandName = (id?: string | null) => brands.find((b) => b.id === id)?.name ?? "";
  const calcWeight = () => {
    if (!prod.size_mm || !prod.grade) return void toast.error("Set size, grade and PN first");
    const sdr = sdrFor(prod.grade, pnNumber(prod.pn ?? null));
    if (!sdr) return void toast.error("Unknown grade/PN for IS 4984 (use PE63, PE80 or PE100)");
    setProd({ ...prod, weight: pipeKgPerM(prod.size_mm, sdr).toFixed(3) });
    toast.success(`IS 4984: SDR ${sdr}`);
  };
  return (
    <>
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
          id="product-name"
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
          options={groups.map((g) => ({
            value: g.id,
            label: g.name,
            sub: `${fmtMoney(rateOf(g.id))}/kg`,
          }))}
        />
      </Field>
      {prod.category === "sprinkler" && (
        <Field label="Brand (weights and raw rate belong to a brand)">
          <Chips
            label="Brand"
            value={prod.brand_id ?? ""}
            onChange={(id) => setProd({ ...prod, brand_id: id || null })}
            options={[
              { value: "", label: "Any brand" },
              ...brands.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Size (mm)">
          <input
            inputMode="numeric"
            value={prod.size_mm ?? ""}
            onChange={(e) =>
              setProd({
                ...prod,
                size_mm: Math.round(Number(e.target.value.replace(/\D/g, ""))) || null,
              })
            }
            className={inputCls}
          />
        </Field>
        {prod.category === "sprinkler" && (
          <Field label="Length (m)">
            <input
              inputMode="decimal"
              list="sprinkler-lengths"
              value={prod.length_m ?? ""}
              onChange={(e) => setProd({ ...prod, length_m: Number(e.target.value) || null })}
              placeholder="6"
              className={inputCls}
            />
            <datalist id="sprinkler-lengths">
              <option value="6" />
              <option value="12" />
            </datalist>
          </Field>
        )}
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
          {fmtNum(n(prod.weight), 3)} kg ×{" "}
          {fmtMoney(rateOf(prod.rate_group_id ?? "", n(prod.weight), prod.brand_id))}/kg ({basis}
          {prod.brand_id ? ` · ${brandName(prod.brand_id)} raw` : ""})
        </span>
        <span className="text-xl font-bold">
          {fmtMoney(
            rateOf(prod.rate_group_id ?? "", n(prod.weight), prod.brand_id) * n(prod.weight),
          )}
          <span className="text-sm font-medium text-muted-foreground">
            /{UNIT_LABELS[(prod.unit ?? "pc") as Unit]}
          </span>
        </span>
      </div>
      {prod.rate_group_id === "SPRINKLER" &&
        (() => {
          // sprinkler pipe: ₹ per piece = raw ₹/kg × piece weight + production + coupler + margin (flat per piece)
          const r = sprinklerRate(prod.brand_id);
          if (!r) return null;
          const raw = r.raw_kg;
          const w = n(prod.weight);
          return (
            <p className="rounded-xl border border-dashed border-border p-3 text-xs leading-relaxed text-muted-foreground tabular-nums">
              How this price is worked out ({basis}
              {prod.brand_id ? `, ${brandName(prod.brand_id)} raw` : ""}
              ): raw ₹{fmtNum(raw)}/kg × {fmtNum(w, 3)} kg = {fmtMoney(raw * w)} + production{" "}
              {fmtMoney(r.production_kg)} + coupler {fmtMoney(r.transport_kg)} + margin{" "}
              {fmtMoney(r.margin)} ={" "}
              <b className="text-foreground">
                {fmtMoney(raw * w + r.production_kg + r.transport_kg + r.margin)}
              </b>{" "}
              per piece. Change these under Pricing.
            </p>
          );
        })()}
    </>
  );
}
