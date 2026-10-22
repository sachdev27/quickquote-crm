import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Phone, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/bottom-nav";
import { Field, inputCls } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/sheet";
import { addCustomer, deleteCustomer, listCustomers, listQuotes, updateCustomer } from "@/data/api";
import { StatusPill } from "@/components/qq";
import { STATUS_LABELS, fmtMoney } from "@/lib/quote";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "Customers — Tarko CRM" }] }),
  component: Customers,
});

type Form = {
  id?: string;
  name: string;
  phone: string;
  address: string;
  gstin: string;
  notes: string;
};
const EMPTY: Form = { name: "", phone: "", address: "", gstin: "", notes: "" };

const wa = (p: string) => {
  const d = p.replace(/\D/g, "");
  return `https://wa.me/${d.length === 10 ? "91" + d : d}`;
};

function Customers() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: () => listCustomers(),
    staleTime: 60_000,
  });
  const [f, setF] = useState<Form | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("");
  const quotes = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes(), staleTime: 30_000 });
  const history = (id: string) => (quotes.data ?? []).filter((x) => x.customer_id === id);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f?.name.trim()) return void toast.error("Name is required");
    try {
      if (f.id) await updateCustomer({ data: { ...f, id: f.id } });
      else await addCustomer({ data: f });
      await qc.invalidateQueries({ queryKey: ["customers"] });
      setF(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }
  async function remove() {
    if (!f?.id || !confirm(`Delete ${f.name}? Their old quotes stay, marked walk-in.`)) return;
    await deleteCustomer({ data: { id: f.id } });
    await qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["quotes"] });
    setF(null);
  }
  const rows = (data ?? []).filter((c) =>
    `${c.name} ${c.phone ?? ""} ${c.gstin ?? ""}`.toLowerCase().includes(q.toLowerCase()),
  );
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    f && setF({ ...f, [k]: k === "gstin" ? e.target.value.toUpperCase() : e.target.value });

  return (
    <PageShell title="Customers" wide>
      <div className="mx-auto max-w-3xl space-y-3 lg:max-w-none">
        <Button
          className="h-12 w-full rounded-xl text-base font-semibold lg:w-auto lg:px-6"
          onClick={() => setF({ ...EMPTY })}
        >
          <Plus className="mr-1 h-5 w-5" /> Add customer
        </Button>
        <input
          placeholder="Search name, phone or GSTIN"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={inputCls}
        />
        {isLoading && <div className="h-16 animate-pulse rounded-2xl bg-secondary" />}
        {data?.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No customers yet.</p>
        )}
        {rows.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between lg:hidden gap-2 rounded-2xl border border-border bg-card p-3 pl-4"
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() =>
                setF({
                  id: c.id,
                  name: c.name,
                  phone: c.phone ?? "",
                  address: c.address ?? "",
                  gstin: c.gstin ?? "",
                  notes: c.notes ?? "",
                })
              }
            >
              <p className="truncate font-semibold">{c.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {[c.phone, c.gstin].filter(Boolean).join(" · ") || "No phone"}
              </p>
            </button>
            {c.phone && (
              <div className="flex gap-2">
                <a
                  href={`tel:${c.phone}`}
                  aria-label={`Call ${c.name}`}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-primary"
                >
                  <Phone className="h-5 w-5" />
                </a>
                <a
                  href={wa(c.phone)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`WhatsApp ${c.name}`}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-primary"
                >
                  <MessageCircle className="h-5 w-5" />
                </a>
              </div>
            )}
          </div>
        ))}

        {rows.length > 0 &&
          (() => {
            const current = rows.find((c) => c.id === sel) ?? rows[0]!;
            const qs = history(current.id);
            const won = qs.filter((x) => x.status === "won").reduce((t, x) => t + x.total, 0);
            return (
              <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start">
                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                  <table className="w-full tabular-nums">
                    <thead className="border-b border-border bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-2">Phone</th>
                        <th className="px-2">GSTIN</th>
                        <th className="px-2 text-right">Quotes</th>
                        <th className="px-2 text-right">Won</th>
                        <th className="px-3">Last quote</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c) => {
                        const h = history(c.id);
                        return (
                          <tr
                            key={c.id}
                            onClick={() => setSel(c.id)}
                            className={`cursor-pointer border-b border-border/50 text-sm ${c.id === current.id ? "bg-primary/10" : "hover:bg-secondary/50"}`}
                          >
                            <td className="px-3 py-2.5 font-semibold">{c.name}</td>
                            <td className="px-2 text-muted-foreground">{c.phone ?? "—"}</td>
                            <td className="px-2 text-muted-foreground">{c.gstin ?? "—"}</td>
                            <td className="px-2 text-right">{h.length}</td>
                            <td className="px-2 text-right font-semibold">
                              {fmtMoney(
                                h
                                  .filter((x) => x.status === "won")
                                  .reduce((t, x) => t + x.total, 0),
                              )}
                            </td>
                            <td className="px-3 text-muted-foreground">
                              {h[0]?.quote_date ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="sticky top-20 space-y-3 rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-bold">{current.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {[current.phone, current.gstin].filter(Boolean).join(" · ") || "No phone"}
                      </p>
                      {current.address && (
                        <p className="text-sm text-muted-foreground">{current.address}</p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      className="h-9 rounded-lg"
                      onClick={() =>
                        setF({
                          id: current.id,
                          name: current.name,
                          phone: current.phone ?? "",
                          address: current.address ?? "",
                          gstin: current.gstin ?? "",
                          notes: current.notes ?? "",
                        })
                      }
                    >
                      Edit
                    </Button>
                  </div>
                  {current.notes && (
                    <p className="whitespace-pre-line rounded-xl bg-secondary p-3 text-sm">
                      {current.notes}
                    </p>
                  )}
                  {current.phone && (
                    <div className="flex gap-2">
                      <Button asChild variant="outline" className="h-10 flex-1 rounded-lg">
                        <a href={`tel:${current.phone}`}>
                          <Phone className="mr-1 h-4 w-4" /> Call
                        </a>
                      </Button>
                      <Button asChild variant="outline" className="h-10 flex-1 rounded-lg">
                        <a href={wa(current.phone)} target="_blank" rel="noreferrer">
                          <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
                        </a>
                      </Button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 tabular-nums">
                    <div className="rounded-xl bg-secondary p-3">
                      <p className="text-xs text-muted-foreground">Quotes</p>
                      <p className="text-lg font-bold">{qs.length}</p>
                    </div>
                    <div className="rounded-xl bg-secondary p-3">
                      <p className="text-xs text-muted-foreground">Won</p>
                      <p className="text-lg font-bold text-emerald-700">{fmtMoney(won)}</p>
                    </div>
                  </div>
                  <ul className="divide-y divide-border/60">
                    {qs.length === 0 && (
                      <li className="py-2 text-sm text-muted-foreground">No quotes yet.</li>
                    )}
                    {qs.map((x) => (
                      <li key={x.id}>
                        <Link
                          to="/quotes/$id"
                          params={{ id: x.id }}
                          className="flex items-center justify-between gap-2 py-2 text-sm hover:text-primary"
                        >
                          <span>
                            <span className="font-semibold">{x.quote_no}</span>{" "}
                            <span className="text-muted-foreground">
                              · {x.quote_date} · {x.brand_name}
                            </span>
                          </span>
                          <span className="flex items-center gap-2 tabular-nums">
                            <b>{fmtMoney(x.total)}</b>
                            <StatusPill
                              status={x.status}
                              label={STATUS_LABELS[x.status] ?? x.status}
                            />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })()}
      </div>

      <Drawer open={!!f} onOpenChange={(o) => !o && setF(null)}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{f?.id ? "Edit customer" : "New customer"}</DrawerTitle>
          </DrawerHeader>
          {f && (
            <form onSubmit={save} className="flex min-h-0 flex-col">
              <div className="space-y-3 overflow-y-auto px-4 pb-4">
                <Field label="Name">
                  <input value={f.name} onChange={set("name")} className={inputCls} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Phone">
                    <input
                      inputMode="tel"
                      value={f.phone}
                      onChange={set("phone")}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="GSTIN">
                    <input value={f.gstin} onChange={set("gstin")} className={inputCls} />
                  </Field>
                </div>
                <Field label="Address">
                  <input value={f.address} onChange={set("address")} className={inputCls} />
                </Field>
                <Field label="Notes">
                  <textarea
                    value={f.notes}
                    onChange={set("notes")}
                    rows={3}
                    className="w-full rounded-xl border border-input bg-background p-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </Field>
              </div>
              <div className="flex gap-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {f.id && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 rounded-xl"
                    onClick={remove}
                  >
                    Delete
                  </Button>
                )}
                <Button type="submit" className="h-12 flex-1 rounded-xl text-base font-semibold">
                  Save customer
                </Button>
              </div>
            </form>
          )}
        </DrawerContent>
      </Drawer>
    </PageShell>
  );
}
