import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/bottom-nav";
import { Card, Field, inputCls } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { Brand } from "@/lib/quote";
import { listBrands, saveBrand } from "@/data/api";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Brands — Tarko CRM" }] }),
  component: SettingsPage,
});

const FIELDS = ["code", "name", "tagline", "address", "phone", "gstin", "pan", "bank_name", "bank_account", "bank_ifsc", "upi_id", "terms"] as const;
type Form = Record<(typeof FIELDS)[number], string> & { id?: string };
const EMPTY = Object.fromEntries(FIELDS.map((k) => [k, ""])) as Form;
const toForm = (b: Brand): Form => ({ id: b.id, ...(Object.fromEntries(FIELDS.map((k) => [k, b[k] ?? ""])) as Form) });

function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["brands"], queryFn: () => listBrands(), staleTime: 5 * 60_000 });
  const [f, setF] = useState<Form | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f) return;
    try {
      const { id, ...rest } = f;
      await saveBrand({ data: { ...(id ? { id } : {}), ...rest } });
      await qc.invalidateQueries({ queryKey: ["brands"] });
      setF(null);
      toast.success("Brand saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message.slice(0, 120) : "Could not save");
    }
  }
  const set = (k: (typeof FIELDS)[number]) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => f && setF({ ...f, [k]: e.target.value });

  return (
    <PageShell title="Brands">
      <div className="mx-auto max-w-md space-y-3">
        <p className="text-sm text-muted-foreground">Each brand has its own letterhead, bank details and terms. Pick one when you create a quote.</p>
        {data?.map((b) => (
          <button key={b.id} type="button" onClick={() => setF(toForm(b))} className="flex w-full items-center justify-between rounded-2xl border border-border bg-card p-4 text-left active:bg-secondary">
            <div>
              <p className="font-semibold">{b.name} <span className="text-xs font-medium text-muted-foreground">{b.code}</span></p>
              <p className="text-sm text-muted-foreground">{b.tagline ?? "—"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{b.gstin ? `GSTIN ${b.gstin}` : "GSTIN not set"}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        ))}
        <Button variant="outline" className="h-12 w-full rounded-xl border-dashed text-base" onClick={() => setF({ ...EMPTY })}>
          <Plus className="mr-1 h-5 w-5" /> Add brand
        </Button>
        <a href="/cdn-cgi/access/logout" className="block pt-4 text-center text-sm text-muted-foreground underline">Sign out</a>
      </div>

      <Drawer open={!!f} onOpenChange={(o) => !o && setF(null)}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left"><DrawerTitle>{f?.id ? "Edit brand" : "New brand"}</DrawerTitle></DrawerHeader>
          {f && (
            <form onSubmit={save} className="flex min-h-0 flex-col">
              <div className="space-y-4 overflow-y-auto px-4 pb-4">
                <Card title="Letterhead">
                  <div className="grid grid-cols-[1fr_6rem] gap-2">
                    <Field label="Brand name"><input value={f.name} onChange={set("name")} className={inputCls} /></Field>
                    <Field label="Code"><input value={f.code} onChange={set("code")} maxLength={6} className={`${inputCls} uppercase`} /></Field>
                  </div>
                  <Field label="Tagline"><input value={f.tagline} onChange={set("tagline")} placeholder="by Sakhi Industries" className={inputCls} /></Field>
                  <Field label="Address"><input value={f.address} onChange={set("address")} className={inputCls} /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Phone"><input inputMode="tel" value={f.phone} onChange={set("phone")} className={inputCls} /></Field>
                    <Field label="GSTIN"><input value={f.gstin} onChange={set("gstin")} className={`${inputCls} uppercase`} /></Field>
                  </div>
                </Card>
                <Card title="Tax">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="PAN"><input value={f.pan} onChange={set("pan")} className={`${inputCls} uppercase`} /></Field>
                  </div>
                </Card>
                <Card title="Bank & UPI">
                  <Field label="Bank name"><input value={f.bank_name} onChange={set("bank_name")} className={inputCls} /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Account no."><input inputMode="numeric" value={f.bank_account} onChange={set("bank_account")} className={inputCls} /></Field>
                    <Field label="IFSC"><input value={f.bank_ifsc} onChange={set("bank_ifsc")} className={`${inputCls} uppercase`} /></Field>
                  </div>
                  <Field label="UPI ID"><input value={f.upi_id} onChange={set("upi_id")} className={inputCls} /></Field>
                </Card>
                <Card title="Terms printed on quotes">
                  <textarea value={f.terms} onChange={set("terms")} rows={4} className="w-full rounded-xl border border-input bg-background p-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </Card>
              </div>
              <div className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Button type="submit" className="h-12 w-full rounded-xl text-base font-semibold">Save brand</Button>
              </div>
            </form>
          )}
        </DrawerContent>
      </Drawer>
    </PageShell>
  );
}
