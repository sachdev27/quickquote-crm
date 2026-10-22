import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, LogOut, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/bottom-nav";
import { Card, Chips, Field, inputCls } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/sheet";
import { useIsDesktop } from "@/hooks/use-mobile";
import type { Brand } from "@/lib/quote";
import { deleteBrand, listBrands, listPricing, saveBrand } from "@/data/api";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Tarko CRM" }] }),
  component: SettingsPage,
});

const FIELDS = [
  "code",
  "name",
  "tagline",
  "address",
  "phone",
  "gstin",
  "pan",
  "bank_name",
  "bank_account",
  "bank_ifsc",
  "upi_id",
  "terms",
  "default_preset_id",
] as const;
type Key = (typeof FIELDS)[number];
type Form = Record<Key, string> & { id?: string };
const EMPTY = Object.fromEntries(FIELDS.map((k) => [k, ""])) as Form;
const toForm = (b: Brand): Form => ({
  id: b.id,
  ...(Object.fromEntries(FIELDS.map((k) => [k, b[k] ?? ""])) as Form),
});

// What a printed quote needs; shown as "missing" badges so gaps are obvious.
const NEEDED: [Key, string][] = [
  ["address", "Address"],
  ["phone", "Phone"],
  ["gstin", "GSTIN"],
  ["pan", "PAN"],
  ["bank_account", "Bank"],
  ["upi_id", "UPI"],
];
const missing = (b: Partial<Record<Key, string | null>>) =>
  NEEDED.filter(([k]) => !b[k]?.trim()).map(([, l]) => l);

function SettingsPage() {
  const qc = useQueryClient();
  const desktop = useIsDesktop();
  const { data } = useQuery({
    queryKey: ["brands"],
    queryFn: () => listBrands(),
    staleTime: 5 * 60_000,
  });
  const pricing = useQuery({
    queryKey: ["pricing"],
    queryFn: () => listPricing(),
    staleTime: 60_000,
  });
  const [f, setF] = useState<Form | null>(null);

  // Desktop shows the editor inline, so start with the first brand open.
  useEffect(() => {
    if (desktop && !f && data?.[0]) setF(toForm(data[0]));
  }, [desktop, data, f]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f) return;
    try {
      const { id, ...rest } = f;
      await saveBrand({ data: { ...(id ? { id } : {}), ...rest } });
      await qc.invalidateQueries({ queryKey: ["brands"] });
      if (!desktop) setF(null);
      toast.success("Brand saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message.slice(0, 120) : "Could not save");
    }
  }
  async function remove() {
    if (!f?.id || !confirm(`Delete brand ${f.name}?`)) return;
    try {
      await deleteBrand({ data: { id: f.id } });
      await qc.invalidateQueries({ queryKey: ["brands"] });
      setF(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }
  const set = (k: Key) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    f &&
    setF({
      ...f,
      [k]: ["gstin", "pan", "bank_ifsc", "code"].includes(k)
        ? e.target.value.toUpperCase()
        : e.target.value,
    });

  const brandForm = f && (
    <form onSubmit={save} className="@container flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        <Letterhead f={f} />
        <div className="space-y-4 @2xl:grid @2xl:grid-cols-2 @2xl:items-start @2xl:gap-4 @2xl:space-y-0">
          <Card title="Letterhead">
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <Field label="Brand name">
                <input value={f.name} onChange={set("name")} className={inputCls} />
              </Field>
              <Field label="Quote prefix">
                <input
                  value={f.code}
                  onChange={set("code")}
                  maxLength={6}
                  placeholder="TRK"
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Tagline">
              <input
                value={f.tagline}
                onChange={set("tagline")}
                placeholder="by Sakhi Industries"
                className={inputCls}
              />
            </Field>
            <Field label="Address">
              <textarea
                value={f.address}
                onChange={set("address")}
                rows={2}
                className={`${inputCls} h-auto py-2`}
              />
            </Field>
            <Field label="Phone">
              <input inputMode="tel" value={f.phone} onChange={set("phone")} className={inputCls} />
            </Field>
          </Card>
          <div className="space-y-4">
            <Card title="Tax">
              <div className="grid grid-cols-2 gap-2">
                <Field label="GSTIN">
                  <input
                    value={f.gstin}
                    onChange={set("gstin")}
                    maxLength={15}
                    className={inputCls}
                  />
                </Field>
                <Field label="PAN">
                  <input value={f.pan} onChange={set("pan")} maxLength={10} className={inputCls} />
                </Field>
              </div>
            </Card>
            <Card title="Bank & UPI">
              <Field label="Bank name">
                <input value={f.bank_name} onChange={set("bank_name")} className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Account no.">
                  <input
                    inputMode="numeric"
                    value={f.bank_account}
                    onChange={set("bank_account")}
                    className={inputCls}
                  />
                </Field>
                <Field label="IFSC">
                  <input
                    value={f.bank_ifsc}
                    onChange={set("bank_ifsc")}
                    maxLength={11}
                    className={inputCls}
                  />
                </Field>
              </div>
              <Field label="UPI ID">
                <input
                  value={f.upi_id}
                  onChange={set("upi_id")}
                  placeholder="name@bank"
                  className={inputCls}
                />
              </Field>
            </Card>
          </div>
          <Card title="Terms printed on quotes">
            <textarea
              value={f.terms}
              onChange={set("terms")}
              rows={4}
              className={`${inputCls} h-auto py-2`}
            />
          </Card>
          <Card title="Pricing">
            <Field label="Default preset when this brand is picked on a quote">
              <Chips
                label="Default preset"
                value={f.default_preset_id}
                onChange={(v) => setF({ ...f, default_preset_id: v })}
                options={[
                  { value: "", label: "None" },
                  ...(pricing.data?.presets ?? []).map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              This brand's raw material price per grade is set under{" "}
              <Link
                to="/products"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Products → Pricing
              </Link>
              .
            </p>
          </Card>
        </div>
      </div>
      <div className="flex gap-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {f.id && (
          <Button type="button" variant="outline" className="h-12 rounded-xl" onClick={remove}>
            Delete
          </Button>
        )}
        <Button type="submit" className="h-12 flex-1 rounded-xl text-base font-semibold">
          {f.id ? "Save brand" : "Create brand"}
        </Button>
      </div>
    </form>
  );

  return (
    <PageShell title="Settings" wide>
      <div className="mx-auto max-w-md space-y-4 lg:grid lg:max-w-none lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-4">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Brands
              </h2>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
                onClick={() => setF({ ...EMPTY })}
              >
                <Plus className="h-4 w-4" /> Add brand
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Each brand has its own letterhead, tax and bank details, terms and default pricing.
            </p>
            {data?.map((b) => {
              const gaps = missing(b);
              const on = desktop && f?.id === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setF(toForm(b))}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${on ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-secondary/50"}`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                    {b.code.slice(0, 3)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{b.name}</span>
                    {gaps.length ? (
                      <span className="block truncate text-xs text-amber-700">
                        Missing: {gaps.join(", ")}
                      </span>
                    ) : (
                      <span className="block text-xs text-emerald-700">Ready for quotes</span>
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Account
            </h2>
            <div className="rounded-2xl border border-border bg-card p-3 text-sm">
              <p className="text-muted-foreground">
                Sign-in is handled by Cloudflare Access for your team.
              </p>
              <a
                href="/cdn-cgi/access/logout"
                className="mt-2 inline-flex items-center gap-2 font-semibold text-primary"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </a>
            </div>
          </section>
        </div>

        {/* desktop: inline editor with live letterhead preview */}
        <div className="hidden lg:sticky lg:top-20 lg:flex lg:h-[calc(100vh-6rem)] lg:flex-col lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-card">
          {desktop &&
            (brandForm ? (
              <>
                <p className="px-4 pt-4 font-semibold">{f?.id ? `Edit ${f.name}` : "New brand"}</p>
                <div className="flex min-h-0 flex-1 flex-col pt-3">{brandForm}</div>
              </>
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">Pick a brand to edit.</p>
            ))}
        </div>
      </div>

      <Drawer open={!!f && !desktop} onOpenChange={(o) => !o && setF(null)}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{f?.id ? `Edit ${f.name}` : "New brand"}</DrawerTitle>
          </DrawerHeader>
          {brandForm}
        </DrawerContent>
      </Drawer>
    </PageShell>
  );
}

// How the top of a printed quote will look with these details.
function Letterhead({ f }: { f: Form }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-background p-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Quote letterhead preview
      </p>
      <div className="flex justify-between gap-4 text-sm">
        <div className="min-w-0">
          <p className="text-xl font-bold leading-tight">{f.name || "Brand name"}</p>
          {f.tagline && <p className="text-muted-foreground">{f.tagline}</p>}
          {f.address && <p className="whitespace-pre-line text-muted-foreground">{f.address}</p>}
          {f.phone && <p className="text-muted-foreground">{f.phone}</p>}
          <p className="text-muted-foreground">
            {[f.gstin && `GSTIN ${f.gstin}`, f.pan && `PAN ${f.pan}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
            Proforma Quotation
          </p>
          <p className="font-semibold">{(f.code || "XXX").toUpperCase()}-2610-001</p>
        </div>
      </div>
    </div>
  );
}
