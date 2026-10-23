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
import {
  deleteBrand,
  deleteTerm,
  listBrands,
  listPricing,
  listTerms,
  saveBrand,
  saveTerm,
  listUsers,
  saveUser,
  deleteUser,
} from "@/data/api";
import { useMe } from "@/hooks/use-me";

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
  const me = useMe();
  if (me.role && !me.isAdmin)
    return (
      <PageShell title="Settings">
        <div className="mx-auto max-w-md space-y-4">
          <Shortcuts isAdmin={false} />
          <AccountCard email={me.email} role={me.role} />
        </div>
      </PageShell>
    );
  return <SettingsAdmin />;
}

function SettingsAdmin() {
  const me = useMe();
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
          <Card title="Terms & conditions">
            <p className="text-sm text-muted-foreground">
              Terms are a shared checklist under Settings → Terms & conditions; pick which ones go
              on each quote.
            </p>
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

          <TermsLibrary />

          <Shortcuts isAdmin />
          <UsersSection me={me.email} />
          <AccountCard email={me.email} role={me.role ?? "admin"} />
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

// Terms & conditions library: ticked = pre-selected on every new quote. Click a term to edit it.
function TermsLibrary() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["terms"], queryFn: () => listTerms(), staleTime: 60_000 });
  const [editing, setEditing] = useState<{ id?: string; text: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["terms"] });

  async function commit() {
    if (!editing) return;
    const text = editing.text.trim();
    if (!text) return void setEditing(null);
    const cur = data?.find((t) => t.id === editing.id);
    await saveTerm({
      data: {
        ...(editing.id ? { id: editing.id } : {}),
        text,
        default_on: cur ? !!cur.default_on : true,
      },
    });
    await refresh();
    setEditing(null);
  }
  async function toggle(t: { id: string; text: string; default_on: number }) {
    await saveTerm({ data: { id: t.id, text: t.text, default_on: !t.default_on } });
    refresh();
  }
  async function remove(t: { id: string; text: string }) {
    if (!confirm(`Delete term "${t.text}"? Quotes already sent keep it.`)) return;
    await deleteTerm({ data: { id: t.id } });
    refresh();
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Terms & conditions
        </h2>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
          onClick={() => setEditing({ text: "" })}
        >
          <Plus className="h-4 w-4" /> Add term
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Ticked terms are pre-selected on every new quote; you can change them per quote.
      </p>
      <ul className="divide-y divide-border/60 rounded-2xl border border-border bg-card">
        {data?.map((t) => (
          <li key={t.id} className="flex items-start gap-3 p-3">
            <input
              type="checkbox"
              aria-label="Default on new quotes"
              checked={!!t.default_on}
              onChange={() => toggle(t)}
              className="mt-1 h-4 w-4 accent-[var(--primary)]"
            />
            {editing?.id === t.id ? (
              <input
                autoFocus
                value={editing.text}
                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") setEditing(null);
                }}
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary"
              />
            ) : (
              <button
                type="button"
                className="min-w-0 flex-1 text-left text-sm hover:text-primary"
                onClick={() => setEditing({ id: t.id, text: t.text })}
              >
                {t.text}
              </button>
            )}
            <button
              type="button"
              aria-label="Delete term"
              className="text-xs text-muted-foreground hover:text-destructive"
              onClick={() => remove(t)}
            >
              Delete
            </button>
          </li>
        ))}
        {editing && !editing.id && (
          <li className="p-3">
            <input
              autoFocus
              placeholder="New term, e.g. 50% advance with order."
              value={editing.text}
              onChange={(e) => setEditing({ ...editing, text: e.target.value })}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setEditing(null);
              }}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary"
            />
          </li>
        )}
      </ul>
    </section>
  );
}

// Phone tab bar has no room for these; Settings doubles as the "more" menu.
function Shortcuts({ isAdmin }: { isAdmin: boolean }) {
  const items = [
    { to: "/insights" as const, label: "Dashboard" },
    { to: "/price-list" as const, label: "Price list" },
    ...(isAdmin ? [{ to: "/products" as const, label: "Products & pricing" }] : []),
  ];
  return (
    <section className="grid grid-cols-3 gap-2 lg:hidden">
      {items.map((i) => (
        <Link
          key={i.to}
          to={i.to}
          className="rounded-2xl border border-border bg-card p-3 text-center text-sm font-semibold hover:bg-secondary"
        >
          {i.label}
        </Link>
      ))}
    </section>
  );
}

function AccountCard({ email, role }: { email: string; role: string }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Account
      </h2>
      <div className="rounded-2xl border border-border bg-card p-3 text-sm">
        <p className="font-semibold">{email || "—"}</p>
        <p className="text-muted-foreground">
          Role: {role === "admin" ? "Admin" : "Accountant"} · sign-in via Cloudflare Access
        </p>
        <a
          href="/cdn-cgi/access/logout"
          className="mt-2 inline-flex items-center gap-2 font-semibold text-primary"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </a>
      </div>
    </section>
  );
}

const ROLE_HELP: Record<string, string> = {
  admin: "Everything, incl. pricing, products, brands, terms and users",
  accountant: "Quotes, pipeline, customers, price list. No pricing or product changes",
};

// Who may use the CRM. Cloudflare Access must also allow their email to sign in.
function UsersSection({ me }: { me: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["users"], queryFn: () => listUsers(), staleTime: 60_000 });
  const [form, setForm] = useState<null | {
    email: string;
    name: string;
    role: "admin" | "accountant";
    isNew: boolean;
  }>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });
  async function save() {
    if (!form) return;
    try {
      await saveUser({ data: { email: form.email, name: form.name, role: form.role } });
      await refresh();
      setForm(null);
      toast.success("User saved. Make sure Cloudflare Access also allows this email.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message.slice(0, 160) : "Could not save");
    }
  }
  async function remove(email: string) {
    if (!confirm(`Remove ${email}? They will no longer be able to use the CRM.`)) return;
    try {
      await deleteUser({ data: { email } });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove");
    }
  }
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Users & roles
        </h2>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
          onClick={() => setForm({ email: "", name: "", role: "accountant", isNew: true })}
        >
          <Plus className="h-4 w-4" /> Add user
        </button>
      </div>
      <ul className="divide-y divide-border/60 rounded-2xl border border-border bg-card">
        {data?.map((u) => (
          <li key={u.email} className="flex items-center gap-3 p-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{u.name || u.email}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {u.email}
                {u.email === me ? " · you" : ""}
              </span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${u.role === "admin" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"}`}
            >
              {u.role === "admin" ? "Admin" : "Accountant"}
            </span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() =>
                setForm({
                  email: u.email,
                  name: u.name ?? "",
                  role: u.role as "admin",
                  isNew: false,
                })
              }
            >
              Edit
            </button>
            {u.email !== me && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={() => remove(u.email)}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {form && (
        <div className="space-y-2 rounded-2xl border border-primary/40 bg-primary/5 p-3">
          <input
            value={form.email}
            disabled={!form.isNew}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="email@gmail.com"
            className={`${inputCls} h-10`}
          />
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Name (optional)"
            className={`${inputCls} h-10`}
          />
          <Chips
            label="Role"
            value={form.role}
            onChange={(r) => setForm({ ...form, role: r })}
            options={[
              { value: "admin" as const, label: "Admin" },
              { value: "accountant" as const, label: "Accountant" },
            ]}
          />
          <p className="text-xs text-muted-foreground">{ROLE_HELP[form.role]}</p>
          <div className="flex gap-2">
            <Button variant="ghost" className="h-10 rounded-xl" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button className="h-10 flex-1 rounded-xl font-semibold" onClick={save}>
              Save user
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
