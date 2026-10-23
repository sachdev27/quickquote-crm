import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tags } from "lucide-react";
import { toast } from "sonner";
import { Field, inputCls } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/sheet";
import { getSettings, setHsnBulk } from "@/data/api";
import { GST_OPTIONS } from "@/lib/quote";

type P = { category: string; grade: string | null; hsn: string | null; gst_rate: number };
type Scope = "all_pipes" | "PE63" | "PE80" | "PE100" | "sprinkler" | "fittings";

const SCOPES: { value: Scope; label: string; pick: (p: P) => boolean }[] = [
  { value: "all_pipes", label: "All HDPE pipes", pick: (p) => p.category === "pipe" },
  { value: "PE63", label: "PE63 pipes", pick: (p) => p.category === "pipe" && p.grade === "PE63" },
  { value: "PE80", label: "PE80 pipes", pick: (p) => p.category === "pipe" && p.grade === "PE80" },
  {
    value: "PE100",
    label: "PE100 pipes",
    pick: (p) => p.category === "pipe" && p.grade === "PE100",
  },
  { value: "sprinkler", label: "Sprinkler pipes", pick: (p) => p.category === "sprinkler" },
  {
    value: "fittings",
    label: "Fittings (quote form default)",
    pick: (p) => p.category === "fitting",
  },
];

// Set HSN/SAC (and optionally GST) for a whole type of product in one go. Saved quotes keep theirs.
export function BulkHsn({ products }: { products: P[] }) {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
    staleTime: 60_000,
  });
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("all_pipes");
  const [hsn, setHsn] = useState("");
  const [gst, setGst] = useState("");
  const [busy, setBusy] = useState(false);

  const def = SCOPES.find((s) => s.value === scope)!;
  const rows = products.filter(def.pick);
  const nowHsn =
    scope === "fittings"
      ? [settings.data?.fittingHsn ?? "3917 40 00"]
      : [...new Set(rows.map((r) => r.hsn ?? "—"))];
  const nowGst =
    scope === "fittings"
      ? [settings.data?.fittingGst ?? 18]
      : [...new Set(rows.map((r) => r.gst_rate))];

  async function apply() {
    if (!hsn.trim() && gst === "") return void toast.error("Enter an HSN/SAC or pick a GST rate");
    setBusy(true);
    try {
      const r = await setHsnBulk({
        data: { scope, hsn: hsn.trim() || undefined, gst: gst === "" ? undefined : Number(gst) },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["products"] }),
        qc.invalidateQueries({ queryKey: ["settings"] }),
      ]);
      toast.success(
        scope === "fittings"
          ? "Fitting defaults saved"
          : `Updated ${r.updated} product${r.updated === 1 ? "" : "s"}`,
      );
      setOpen(false);
      setHsn("");
      setGst("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message.slice(0, 140) : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="h-10 rounded-xl"
        onClick={() => setOpen(true)}
        title="Set HSN/SAC and GST for a whole type of product"
      >
        <Tags className="h-4 w-4 xl:mr-1" /> <span className="hidden xl:inline">HSN/SAC</span>
      </Button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Set HSN/SAC and GST in one go</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Field label="Apply to">
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as Scope)}
                className={inputCls}
              >
                {SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                    {s.value !== "fittings" ? ` (${products.filter(s.pick).length})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-xs text-muted-foreground">
              Now: HSN/SAC <b>{nowHsn.join(", ") || "—"}</b> · GST{" "}
              <b>{nowGst.map((g) => `${g}%`).join(", ") || "—"}</b>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="New HSN/SAC">
                <input
                  value={hsn}
                  onChange={(e) => setHsn(e.target.value)}
                  placeholder="3917 21 90"
                  className={inputCls}
                  autoFocus
                />
              </Field>
              <Field label="New GST (optional)">
                <select value={gst} onChange={(e) => setGst(e.target.value)} className={inputCls}>
                  <option value="">Keep as is</option>
                  {GST_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}%
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Applies to products from now on. Quotes and invoices already saved keep their own
              HSN/SAC.
            </p>
            <Button
              className="h-11 w-full rounded-xl font-semibold"
              disabled={busy}
              onClick={apply}
            >
              {busy ? "Saving…" : "Apply"}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
