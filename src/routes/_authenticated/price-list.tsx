import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { PageShell } from "@/components/bottom-nav";
import { Chips, Field } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { listBrands, listPricing, listProducts } from "@/data/api";
import { LAST_BRAND, LAST_PRESET } from "@/lib/catalog";
import {
  CATEGORY_LABELS,
  PRODUCT_GROUPS,
  UNIT_LABELS,
  categoryDefaults,
  fmtNum,
  withBrandRaw,
  type Unit,
} from "@/lib/quote";
import { unitPriceFor } from "@/lib/pricing";
import { recall } from "@/lib/utils";
import { pnNumber } from "@/lib/weights";

export const Route = createFileRoute("/_authenticated/price-list")({
  head: () => ({ meta: [{ title: "Price list — Tarko CRM" }] }),
  component: PriceList,
});

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

// Printable price list in the factory's familiar layout, generated from weights × preset ₹/kg.
function PriceList() {
  const brands = useQuery({
    queryKey: ["brands"],
    queryFn: () => listBrands(),
    staleTime: 5 * 60_000,
  });
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
  const [brandId, setBrandId] = useState("");
  const [presetId, setPresetId] = useState("");
  const [withGst, setWithGst] = useState(true);
  const [nonIsi, setNonIsi] = useState(false);
  const [wef, setWef] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (brands.data?.length && !brandId)
      setBrandId(brands.data.find((b) => b.id === recall(LAST_BRAND))?.id ?? brands.data[0]!.id);
  }, [brands.data, brandId]);
  useEffect(() => {
    if (pricing.data?.presets.length && !presetId)
      setPresetId(
        pricing.data.presets.find((p) => p.id === recall(LAST_PRESET))?.id ??
          pricing.data.presets[0]!.id,
      );
  }, [pricing.data, presetId]);

  const brand = brands.data?.find((b) => b.id === brandId);
  const rateRow = (group: string) => {
    const r = pricing.data?.rates.find(
      (x) =>
        x.profile_id === pricing.data!.activeProfileId &&
        x.preset_id === presetId &&
        x.group_id === group,
    );
    const b = pricing.data?.brandRaw.find(
      (x) =>
        x.profile_id === pricing.data!.activeProfileId &&
        x.brand_id === brandId &&
        x.group_id === group,
    );
    return r && withBrandRaw(r, b);
  };
  const all = prods.data ?? [];
  const price = (p: (typeof all)[number]) => {
    const r = rateRow(p.rate_group_id);
    const base = unitPriceFor(p, r ?? undefined, nonIsi);
    return base * (withGst ? 1 + p.gst_rate / 100 : 1);
  };
  // Size x class tables for subcategories whose weight comes from IS 4984 or a weight table (HDPE, PLB, DWC);
  // a plain list for the rest. Sprinkler weights belong to a brand; fixed-price items print only with a base price.
  const gridded = (c: string) => ["is4984", "matrix"].includes(categoryDefaults(c).weightMethod);
  const tablesOf = (cat: string) => {
    const items = all.filter((p) => p.category === cat);
    const order = categoryDefaults(cat).grades;
    const keys = uniq(items.map((p) => `${p.grade ?? ""}|${p.roll ?? "complete"}`)).sort(
      (a, b) => order.indexOf(a.split("|")[0]!) - order.indexOf(b.split("|")[0]!),
    );
    return keys.map((k) => {
      const [grade, roll] = k.split("|") as [string, string];
      const rows = items.filter(
        (p) => (p.grade ?? "") === grade && (p.roll ?? "complete") === roll,
      );
      return {
        key: `${cat}|${k}`,
        cat,
        grade,
        roll,
        rows,
        sizes: uniq(rows.map((p) => p.size_mm ?? 0)).sort((a, b) => a - b),
        pns: uniq(rows.map((p) => p.pn ?? "")).sort((a, b) => pnNumber(a) - pnNumber(b)),
      };
    });
  };
  const listed = (p: (typeof all)[number]) =>
    p.category === "sprinkler"
      ? !p.brand_id || p.brand_id === brandId
      : categoryDefaults(p.category).priceMethod === "fixed"
        ? p.base_price != null
        : p.weight_kg > 0;
  const sections = (PRODUCT_GROUPS.length ? PRODUCT_GROUPS : [{ id: "", label: "" }])
    .map((g) => {
      const cats = Object.keys(CATEGORY_LABELS).filter(
        (c) => (categoryDefaults(c).parent ?? "") === g.id || !PRODUCT_GROUPS.length,
      );
      return {
        ...g,
        tables: cats.filter(gridded).flatMap(tablesOf),
        others: all.filter((p) => cats.includes(p.category) && !gridded(p.category) && listed(p)),
      };
    })
    .filter((g) => g.tables.length || g.others.length);
  const gstRates = uniq(
    all.filter(listed).map((p) => `${CATEGORY_LABELS[p.category] ?? p.category} ${p.gst_rate}%`),
  );

  return (
    <PageShell title="Price list" wide back="/products">
      <div className="no-print mx-auto mb-4 max-w-4xl space-y-3">
        {brands.data && brands.data.length > 1 && (
          <Field label="Brand">
            <Chips
              label="Brand"
              value={brandId}
              onChange={setBrandId}
              options={brands.data.map((b) => ({ value: b.id, label: b.name }))}
            />
          </Field>
        )}
        {pricing.data && (
          <Field label="Preset">
            <Chips
              label="Preset"
              value={presetId}
              onChange={setPresetId}
              options={pricing.data.presets.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            Prices incl. GST <Switch checked={withGst} onCheckedChange={setWithGst} />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            Non-ISI <Switch checked={nonIsi} onCheckedChange={setNonIsi} />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            W.E.F.{" "}
            <input
              type="date"
              value={wef}
              onChange={(e) => setWef(e.target.value)}
              className="h-10 rounded-lg border border-input bg-background px-2"
            />
          </label>
          <Button className="ml-auto h-11 rounded-xl" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print / save PDF
          </Button>
        </div>
      </div>

      <article className="print-sheet mx-auto max-w-4xl rounded-2xl border border-border bg-card p-6 text-sm md:p-10">
        <header className="border-b border-border pb-3 text-center">
          <p className="text-2xl font-bold uppercase tracking-wide">
            {brand?.tagline?.replace(/^by\s+/i, "") || brand?.name}
          </p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {brand?.name} ·{" "}
            {sections
              .map((g) => g.label)
              .filter(Boolean)
              .join(" · ")}
          </p>
          {brand?.address && <p className="text-muted-foreground">{brand.address}</p>}
          {brand?.phone && <p className="text-muted-foreground">{brand.phone}</p>}
        </header>
        <div className="my-3 flex items-baseline justify-between">
          <p className="text-lg font-bold underline underline-offset-4">
            PRICE LIST{nonIsi ? " · NON-ISI" : ""}
          </p>
          <p className="font-semibold">W.E.F.: {wef.split("-").reverse().join("/")}</p>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Pipes in ₹ per metre{withGst ? ", GST included" : ", GST extra"}.
        </p>

        {sections.map((g) => (
          <section key={g.id} className="mt-4 break-inside-avoid-page first:mt-0">
            {sections.length > 1 && g.label && (
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">{g.label}</h2>
            )}
            <div className="grid gap-5 md:grid-cols-2 print:grid-cols-2">
              {g.tables.map((t) => (
                <table
                  key={t.key}
                  className="w-full border-collapse self-start tabular-nums text-xs"
                >
                  <thead>
                    <tr>
                      <th
                        colSpan={2 + t.pns.length}
                        className="border border-foreground/40 bg-secondary py-1 text-center font-bold"
                      >
                        {t.cat === "pipe"
                          ? "GRADE"
                          : (CATEGORY_LABELS[t.cat] ?? t.cat).toUpperCase()}{" "}
                        {t.grade}
                        {t.roll === "cut" ? " · CUT ROLL" : ""}
                      </th>
                    </tr>
                    <tr>
                      <th className="border border-foreground/40 px-1 py-1">SIZE</th>
                      <th className="border border-foreground/40 px-1">
                        {t.roll === "cut" ? "INCH" : "LENGTH"}
                      </th>
                      {t.pns.map((pn) => (
                        <th key={pn} className="border border-foreground/40 px-1">
                          {pn}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.sizes.map((size) => {
                      const any = t.rows.find((p) => p.size_mm === size);
                      return (
                        <tr key={size}>
                          <td className="border border-foreground/40 px-1 py-0.5">
                            {categoryDefaults(t.cat).weightMethod === "matrix"
                              ? `DN ${size}`
                              : `${size}MM${any?.inch ? ` (${any.inch})` : ""}`}
                          </td>
                          <td className="border border-foreground/40 px-1 text-center">
                            {t.roll === "cut"
                              ? (any?.inch ?? "")
                              : any?.roll_lengths
                                ? `${any.roll_lengths} m`
                                : ""}
                          </td>
                          {t.pns.map((pn) => {
                            const p = t.rows.find((x) => x.size_mm === size && x.pn === pn);
                            return (
                              <td key={pn} className="border border-foreground/40 px-1 text-right">
                                {p ? fmtNum(price(p)) : "–"}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ))}
            </div>

            {g.others.length > 0 && (
              <table className="mt-5 w-full border-collapse tabular-nums text-xs">
                <tbody>
                  {g.others.map((p) => (
                    <tr key={p.id}>
                      <td className="border border-foreground/40 px-2 py-1 font-medium uppercase">
                        {brand?.name} {p.name}
                        {p.grade &&
                        categoryDefaults(p.category).grades.includes(p.grade) &&
                        !p.name.toUpperCase().includes(p.grade)
                          ? ` · ${p.grade}`
                          : ""}
                      </td>
                      <td className="w-32 border border-foreground/40 px-2 text-right font-semibold">
                        ₹{fmtNum(price(p))} / {UNIT_LABELS[p.unit as Unit]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}

        <ol className="mt-4 list-[lower-alpha] space-y-0.5 pl-5 text-xs uppercase">
          <li>Price: ex-factory</li>
          {withGst ? (
            <li>GST included ({gstRates.join(", ")})</li>
          ) : (
            <li>GST extra: {gstRates.join(", ")}</li>
          )}
          {brand?.terms
            ?.split(/(?<=\.)\s+/)
            .filter(Boolean)
            .map((t) => (
              <li key={t}>{t.replace(/\.$/, "")}</li>
            ))}
        </ol>
        <p className="mt-4 text-right font-semibold uppercase">
          {brand?.tagline?.replace(/^by\s+/i, "") || brand?.name}
        </p>
        <div className="mt-10 flex justify-between text-xs font-semibold uppercase">
          <span>Acknowledgement receipt · Name: ____________________</span>
          <span>Date: __________</span>
        </div>
      </article>
    </PageShell>
  );
}
