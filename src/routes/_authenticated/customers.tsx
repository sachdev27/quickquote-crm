import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/bottom-nav";
import { Card, inputCls } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { addCustomer, listCustomers } from "@/data/api";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "Customers — Tarko CRM" }] }),
  component: Customers,
});

const wa = (p: string) => {
  const d = p.replace(/\D/g, "");
  return `https://wa.me/${d.length === 10 ? "91" + d : d}`;
};

function Customers() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["customers"], queryFn: () => listCustomers(), staleTime: 60_000 });
  const [f, setF] = useState({ name: "", phone: "", address: "", gstin: "" });
  const [q, setQ] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return;
    try {
      await addCustomer({ data: f });
      setF({ name: "", phone: "", address: "", gstin: "" });
      qc.invalidateQueries({ queryKey: ["customers"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }
  const rows = (data ?? []).filter((c) => `${c.name} ${c.phone ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <PageShell title="Customers">
      <div className="grid gap-4 md:grid-cols-[22rem_1fr] md:items-start">
        <form onSubmit={add}>
          <Card title="Add customer">
            <input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} />
            <input placeholder="Phone" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={inputCls} />
            <input placeholder="GSTIN (optional)" value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} className={inputCls} />
            <input placeholder="Address (optional)" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} className={inputCls} />
            <Button type="submit" className="h-12 w-full rounded-xl text-base font-semibold">Save customer</Button>
          </Card>
        </form>
        <div className="space-y-2">
          <input placeholder="Search customers" value={q} onChange={(e) => setQ(e.target.value)} className={inputCls} />
          {isLoading && <div className="h-16 animate-pulse rounded-2xl bg-secondary" />}
          {data?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No customers yet.</p>}
          {rows.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-3 pl-4">
              <div className="min-w-0">
                <p className="truncate font-semibold">{c.name}</p>
                <p className="truncate text-sm text-muted-foreground">{c.phone ?? "No phone"}</p>
              </div>
              {c.phone && (
                <div className="flex gap-2">
                  <a href={`tel:${c.phone}`} aria-label={`Call ${c.name}`} className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-primary"><Phone className="h-5 w-5" /></a>
                  <a href={wa(c.phone)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${c.name}`} className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-primary"><MessageCircle className="h-5 w-5" /></a>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
