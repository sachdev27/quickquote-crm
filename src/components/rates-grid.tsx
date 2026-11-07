import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listCategories, listPricing, saveRate } from "@/data/api";
import { fmtMoney, ratePerKg } from "@/lib/quote";
import { cn } from "@/lib/utils";

type Cat = Awaited<ReturnType<typeof listCategories>>["categories"][number];
type Pricing = Awaited<ReturnType<typeof listPricing>>;
type RateRow = Pricing["rates"][number];

const field =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const lbl = "mb-1 block text-xs font-medium text-muted-foreground";
const gradesOf = (c: Cat) => c.grades.split(",").filter(Boolean);
const groupOf = (c: Cat, grade: string | null) => (grade ? `${c.id}:${grade}` : c.id);

// Rates per subcategory x grade for one preset (active rate profile). Click a cell to edit it.
export function RatesGrid({ cats, pricing }: { cats: Cat[]; pricing: Pricing }) {
  const qc = useQueryClient();
  const [presetId, setPresetId] = useState(pricing.presets[0]?.id ?? "");
  const [edit, setEdit] = useState<{ cat: Cat; group: string; label: string } | null>(null);
  const columns = [...new Set(cats.flatMap(gradesOf))];
  const hasUngraded = cats.some((c) => !gradesOf(c).length);
  const rowOf = (group: string) =>
    pricing.rates.find(
      (r) =>
        r.profile_id === pricing.activeProfileId &&
        r.preset_id === presetId &&
        r.group_id === group,
    );
  const cell = (c: Cat, group: string) => {
    const r = rowOf(group);
    if (!r) return "—";
    if (c.price_method === "fixed")
      return r.margin_is_pct ? `+${r.margin}%` : `+${fmtMoney(r.margin)}`;
    if (c.price_method === "sprinkler_piece") return `${fmtMoney(r.raw_kg)}/kg raw`;
    return `${fmtMoney(ratePerKg(r))}/kg`;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Preset</span>
        {pricing.presets.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setPresetId(p.id);
              setEdit(null);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              p.id === presetId
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted",
            )}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Subcategory</th>
              {columns.map((g) => (
                <th key={g} className="px-3 py-2 text-right font-medium">
                  {g}
                </th>
              ))}
              {hasUngraded && <th className="px-3 py-2 text-right font-medium">No grade</th>}
            </tr>
          </thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{c.label}</td>
                {columns.map((g) => (
                  <td key={g} className="px-1 py-1 text-right">
                    {gradesOf(c).includes(g) ? (
                      <CellButton
                        active={edit?.group === groupOf(c, g)}
                        onClick={() =>
                          setEdit({ cat: c, group: groupOf(c, g), label: `${c.label} ${g}` })
                        }
                      >
                        {cell(c, groupOf(c, g))}
                      </CellButton>
                    ) : (
                      <span className="px-2 text-muted-foreground/40">·</span>
                    )}
                  </td>
                ))}
                {hasUngraded && (
                  <td className="px-1 py-1 text-right">
                    {!gradesOf(c).length ? (
                      <CellButton
                        active={edit?.group === c.id}
                        onClick={() => setEdit({ cat: c, group: c.id, label: c.label })}
                      >
                        {cell(c, c.id)}
                      </CellButton>
                    ) : (
                      <span className="px-2 text-muted-foreground/40">·</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <RateEditor
          key={`${edit.group}|${presetId}`}
          title={`${edit.label} · ${pricing.presets.find((p) => p.id === presetId)?.name ?? ""}`}
          method={edit.cat.price_method}
          row={rowOf(edit.group)}
          onCancel={() => setEdit(null)}
          onSave={async (v) => {
            try {
              await saveRate({
                data: {
                  ...v,
                  profile_id: pricing.activeProfileId,
                  preset_id: presetId,
                  group_id: edit.group,
                },
              });
              await qc.invalidateQueries({ queryKey: ["pricing"] });
              toast.success("Rate saved");
              setEdit(null);
            } catch (e) {
              toast.error(e instanceof Error ? e.message.slice(0, 140) : "Could not save");
            }
          }}
        />
      )}
    </div>
  );
}

function CellButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-md px-2 py-1.5 text-right hover:bg-primary/10",
        active && "bg-primary/10 ring-1 ring-primary/40",
      )}
    >
      {children}
    </button>
  );
}

type RateValues = Pick<
  RateRow,
  "raw_kg" | "raw_kg_non_isi" | "production_kg" | "transport_kg" | "margin"
> & { margin_is_pct: boolean };

function RateEditor({
  title,
  method,
  row,
  onSave,
  onCancel,
}: {
  title: string;
  method: string;
  row: RateRow | undefined;
  onSave: (v: RateValues) => Promise<void>;
  onCancel: () => void;
}) {
  const s = (x: number | null | undefined) => (x == null ? "" : String(x));
  const [v, setV] = useState({
    raw: s(row?.raw_kg ?? 0),
    nonIsi: s(row?.raw_kg_non_isi),
    prod: s(row?.production_kg ?? 0),
    trans: s(row?.transport_kg ?? 0),
    margin: s(row?.margin ?? 0),
    pct: (row?.margin_is_pct ?? 1) === 1,
  });
  const [busy, setBusy] = useState(false);
  const n = (x: string) => (Number.isFinite(Number(x)) ? Math.max(0, Number(x)) : 0);
  const fixed = method === "fixed";
  const piece = method === "sprinkler_piece";
  const num = (key: keyof typeof v, label: string) => (
    <label>
      <span className={lbl}>{label}</span>
      <input
        inputMode="decimal"
        value={v[key] as string}
        onChange={(e) => setV({ ...v, [key]: e.target.value })}
        className={field}
      />
    </label>
  );
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {!fixed && num("raw", "Raw ₹/kg")}
        {!fixed && num("nonIsi", "Non-ISI raw ₹/kg")}
        {!fixed && num("prod", piece ? "Production ₹/pc" : "Production ₹/kg")}
        {!fixed && num("trans", piece ? "Coupler ₹/pc" : "Transport ₹/kg")}
        {num("margin", piece ? "Margin ₹/pc" : v.pct ? "Margin %" : "Margin ₹")}
        {!piece && (
          <label>
            <span className={lbl}>Margin as</span>
            <select
              value={v.pct ? "pct" : "flat"}
              onChange={(e) => setV({ ...v, pct: e.target.value === "pct" })}
              className={field}
            >
              <option value="pct">% of cost</option>
              <option value="flat">{fixed ? "Flat ₹" : "Flat ₹/kg"}</option>
            </select>
          </label>
        )}
      </div>
      {fixed && (
        <p className="mt-2 text-xs text-muted-foreground">
          Price = product&rsquo;s base price {v.pct ? `+ ${v.margin || 0}%` : `+ ₹${v.margin || 0}`}
          .
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onSave({
              raw_kg: n(v.raw),
              raw_kg_non_isi: v.nonIsi.trim() === "" ? null : n(v.nonIsi),
              production_kg: n(v.prod),
              transport_kg: n(v.trans),
              margin: n(v.margin),
              // sprinkler margin is always flat ₹/piece; keep whatever flag the row had
              margin_is_pct: piece ? row?.margin_is_pct === 1 : v.pct,
            });
            setBusy(false);
          }}
        >
          Save rate
        </Button>
      </div>
    </div>
  );
}
