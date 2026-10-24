import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  DollarSign,
  FileText,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/bottom-nav";
import { Field, inputCls } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { ProPagination } from "@/components/pro-pagination";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/sheet";
import {
  addCustomer,
  deleteContact,
  deleteCustomer,
  listContacts,
  listCustomers,
  listQuotes,
  saveContact,
  updateCustomer,
} from "@/data/api";
import { StatusPill } from "@/components/qq";
import { STATUS_LABELS, fmtMoney } from "@/lib/quote";
import { stateOf } from "@/lib/quote-doc";

export const Route = createFileRoute("/_authenticated/customers")({
  validateSearch: (s: Record<string, unknown>): { id?: string } =>
    typeof s["id"] === "string" ? { id: s["id"] } : {},
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
  contact_person: string;
  email: string;
  pan: string;
  city: string;
  state: string;
  pincode: string;
  ship_to: string;
};
const EMPTY: Form = {
  name: "",
  phone: "",
  address: "",
  gstin: "",
  notes: "",
  contact_person: "",
  email: "",
  pan: "",
  city: "",
  state: "",
  pincode: "",
  ship_to: "",
};
// the whole customer record as form text (null -> "")
const toForm = (c: {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  notes: string | null;
  contact_person: string | null;
  email: string | null;
  pan: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  ship_to: string | null;
}): Form => ({
  id: c.id,
  name: c.name,
  phone: c.phone ?? "",
  address: c.address ?? "",
  gstin: c.gstin ?? "",
  notes: c.notes ?? "",
  contact_person: c.contact_person ?? "",
  email: c.email ?? "",
  pan: c.pan ?? "",
  city: c.city ?? "",
  state: c.state ?? "",
  pincode: c.pincode ?? "",
  ship_to: c.ship_to ?? "",
});

const wa = (p: string) => {
  const d = p.replace(/\D/g, "");
  return `https://wa.me/${d.length === 10 ? "91" + d : d}`;
};

type SortCol = "name" | "phone" | "gstin" | "quotes" | "won" | "last_quote";
type SegmentFilter = "all" | "active" | "won" | "no_quotes";

function Customers() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: () => listCustomers(),
    staleTime: 60_000,
  });
  const [f, setF] = useState<Form | null>(null);
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<SegmentFilter>("all");
  const [sortCol, setSortCol] = useState<SortCol>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const search = Route.useSearch();
  const [sel, setSel] = useState(search.id ?? "");
  // deep link from search: select on desktop, open the editor on phones
  useEffect(() => {
    if (!search.id || !data) return;
    setSel(search.id);
    const c = data.find((x) => x.id === search.id);
    if (c && typeof window !== "undefined" && window.innerWidth < 1024) setF(toForm(c));
  }, [search.id, data]);

  const quotes = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes(), staleTime: 30_000 });
  const history = (id: string) => (quotes.data ?? []).filter((x) => x.customer_id === id);

  // Precompute customer metrics map
  const statsMap = useMemo(() => {
    const map = new Map<string, { count: number; won: number; lastDate: string }>();
    for (const quote of quotes.data ?? []) {
      if (!quote.customer_id) continue;
      const cur = map.get(quote.customer_id) ?? { count: 0, won: 0, lastDate: "" };
      cur.count += 1;
      if (quote.status === "won") cur.won += quote.total;
      if (!cur.lastDate || quote.quote_date > cur.lastDate) cur.lastDate = quote.quote_date;
      map.set(quote.customer_id, cur);
    }
    return map;
  }, [quotes.data]);

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

  const filtered = useMemo(() => {
    return (data ?? []).filter((c) => {
      const matchSearch =
        !q.trim() ||
        `${c.name} ${c.phone ?? ""} ${c.gstin ?? ""} ${c.city ?? ""}`
          .toLowerCase()
          .includes(q.toLowerCase());
      if (!matchSearch) return false;

      const st = statsMap.get(c.id) ?? { count: 0, won: 0, lastDate: "" };
      if (segment === "active" && st.count === 0) return false;
      if (segment === "won" && st.won === 0) return false;
      if (segment === "no_quotes" && st.count > 0) return false;

      return true;
    });
  }, [data, q, segment, statsMap]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const stA = statsMap.get(a.id) ?? { count: 0, won: 0, lastDate: "" };
      const stB = statsMap.get(b.id) ?? { count: 0, won: 0, lastDate: "" };

      let diff = 0;
      if (sortCol === "name") diff = a.name.localeCompare(b.name);
      else if (sortCol === "phone") diff = (a.phone ?? "").localeCompare(b.phone ?? "");
      else if (sortCol === "gstin") diff = (a.gstin ?? "").localeCompare(b.gstin ?? "");
      else if (sortCol === "quotes") diff = stA.count - stB.count;
      else if (sortCol === "won") diff = stA.won - stB.won;
      else if (sortCol === "last_quote") diff = stA.lastDate.localeCompare(stB.lastDate);

      return sortAsc ? diff : -diff;
    });
  }, [filtered, sortCol, sortAsc, statsMap]);

  const totalPages = Math.ceil(sorted.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(col === "name" || col === "phone");
    }
  };

  const handleFilterChange = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    f &&
    setF(
      (() => {
        const v = k === "gstin" || k === "pan" ? e.target.value.toUpperCase() : e.target.value;
        const next = { ...f, [k]: v };
        const st = (g: string) => stateOf(g)?.replace(/\s*\(\d+\)$/, "") ?? "";
        if (k === "gstin" && (!f.state || f.state === st(f.gstin))) next.state = st(v) || f.state;
        return next;
      })(),
    );

  const current = sorted.find((c) => c.id === sel) ?? sorted[0] ?? null;
  const qs = current ? history(current.id) : [];
  const won = qs.filter((x) => x.status === "won").reduce((t, x) => t + x.total, 0);

  return (
    <PageShell title="Customers" wide>
      <div className="mx-auto max-w-3xl space-y-3 lg:max-w-none">
        {/* Pro Toolbar & Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Button
              className="h-10 rounded-xl font-semibold gap-1.5 shadow-sm"
              onClick={() => setF({ ...EMPTY })}
            >
              <Plus className="h-4 w-4" /> Add customer
            </Button>

            {/* Search Input */}
            <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Search name, phone, GSTIN, city..."
                value={q}
                onChange={(e) => handleFilterChange(() => setQ(e.target.value))}
                className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-8 text-xs font-medium placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => handleFilterChange(() => setQ(""))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Segment Filter Buttons */}
            <div className="flex items-center rounded-xl border border-border bg-card p-0.5 shadow-sm text-xs">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "active", label: "With Quotes" },
                  { id: "won", label: "Won Deals" },
                  { id: "no_quotes", label: "New" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleFilterChange(() => setSegment(tab.id))}
                  className={`rounded-lg px-2.5 py-1.5 font-semibold transition-colors ${
                    segment === tab.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground tabular-nums">
            Showing <b className="text-foreground">{sorted.length}</b> customer
            {sorted.length === 1 ? "" : "s"}
          </p>
        </div>

        {isLoading && <div className="h-20 animate-pulse rounded-2xl bg-secondary" />}

        {data?.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No customers yet.</p>
        )}

        {/* Mobile View: Cards */}
        <div className="space-y-2 lg:hidden">
          {paginatedRows.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3 pl-4 shadow-sm"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setF(toForm(c))}
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
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-primary"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                  <a
                    href={wa(c.phone)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`WhatsApp ${c.name}`}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-primary"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </a>
                </div>
              )}
            </div>
          ))}
          {sorted.length > 0 && (
            <ProPagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={sorted.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              itemName="customers"
            />
          )}
        </div>

        {/* Desktop View: Pro Grid + Detail Pane */}
        {sorted.length > 0 && current && (
          <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <table className="w-full tabular-nums text-sm">
                <thead className="border-b border-border bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th
                      className="cursor-pointer px-3 py-2.5 hover:text-foreground"
                      onClick={() => toggleSort("name")}
                    >
                      <div className="flex items-center gap-1">
                        <span>Name</span>
                        {sortCol === "name" ? (
                          sortAsc ? (
                            <ArrowUp className="h-3 w-3 text-primary" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th
                      className="cursor-pointer px-2 py-2.5 hover:text-foreground"
                      onClick={() => toggleSort("phone")}
                    >
                      <div className="flex items-center gap-1">
                        <span>Phone</span>
                        {sortCol === "phone" ? (
                          sortAsc ? (
                            <ArrowUp className="h-3 w-3 text-primary" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th
                      className="cursor-pointer px-2 py-2.5 hover:text-foreground"
                      onClick={() => toggleSort("gstin")}
                    >
                      <div className="flex items-center gap-1">
                        <span>GSTIN</span>
                        {sortCol === "gstin" ? (
                          sortAsc ? (
                            <ArrowUp className="h-3 w-3 text-primary" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th
                      className="cursor-pointer px-2 py-2.5 text-right hover:text-foreground"
                      onClick={() => toggleSort("quotes")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Quotes</span>
                        {sortCol === "quotes" ? (
                          sortAsc ? (
                            <ArrowUp className="h-3 w-3 text-primary" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th
                      className="cursor-pointer px-2 py-2.5 text-right hover:text-foreground"
                      onClick={() => toggleSort("won")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Won</span>
                        {sortCol === "won" ? (
                          sortAsc ? (
                            <ArrowUp className="h-3 w-3 text-primary" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th
                      className="cursor-pointer px-3 py-2.5 hover:text-foreground"
                      onClick={() => toggleSort("last_quote")}
                    >
                      <div className="flex items-center gap-1">
                        <span>Last quote</span>
                        {sortCol === "last_quote" ? (
                          sortAsc ? (
                            <ArrowUp className="h-3 w-3 text-primary" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {paginatedRows.map((c) => {
                    const st = statsMap.get(c.id) ?? { count: 0, won: 0, lastDate: "" };
                    const isSelected = c.id === current.id;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setSel(c.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-primary/10 font-semibold text-foreground"
                            : "hover:bg-secondary/50 text-foreground/90"
                        }`}
                      >
                        <td className="px-3 py-2.5 font-semibold">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-foreground">
                              {c.name.slice(0, 1).toUpperCase()}
                            </span>
                            <span className="truncate max-w-[11rem]">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-2 text-muted-foreground">{c.phone ?? "—"}</td>
                        <td className="px-2 text-muted-foreground">{c.gstin ?? "—"}</td>
                        <td className="px-2 text-right">
                          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-secondary px-1.5 text-xs font-semibold">
                            {st.count}
                          </span>
                        </td>
                        <td className="px-2 text-right font-semibold text-emerald-700 dark:text-emerald-500">
                          {fmtMoney(st.won)}
                        </td>
                        <td className="px-3 text-muted-foreground">{st.lastDate ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pro Pagination */}
              <ProPagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={sorted.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemName="customers"
              />
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
                  onClick={() => setF(toForm(current))}
                >
                  Edit
                </Button>
              </div>
              <ContactsList customerId={current.id} />
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
                        <StatusPill status={x.status} label={STATUS_LABELS[x.status] ?? x.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <Drawer open={!!f} onOpenChange={(o) => !o && setF(null)}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{f?.id ? "Edit customer" : "New customer"}</DrawerTitle>
          </DrawerHeader>
          {f && (
            <form onSubmit={save} className="flex min-h-0 flex-col">
              <div className="space-y-3 overflow-y-auto px-4 pb-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Company / customer name *">
                    <input value={f.name} onChange={set("name")} className={inputCls} />
                  </Field>
                  <Field label="Contact person">
                    <input
                      value={f.contact_person}
                      onChange={set("contact_person")}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      inputMode="tel"
                      value={f.phone}
                      onChange={set("phone")}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      type="email"
                      value={f.email}
                      onChange={set("email")}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="GSTIN">
                    <input
                      maxLength={15}
                      value={f.gstin}
                      onChange={set("gstin")}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="PAN">
                    <input
                      maxLength={10}
                      value={f.pan}
                      onChange={set("pan")}
                      className={inputCls}
                    />
                  </Field>
                </div>
                <Field label="Address (street, area)">
                  <textarea
                    value={f.address}
                    onChange={set("address")}
                    rows={2}
                    className={`${inputCls} h-auto py-2`}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="City / district">
                    <input value={f.city} onChange={set("city")} className={inputCls} />
                  </Field>
                  <Field label="State">
                    <input value={f.state} onChange={set("state")} className={inputCls} />
                  </Field>
                  <Field label="Pincode">
                    <input
                      inputMode="numeric"
                      maxLength={6}
                      value={f.pincode}
                      onChange={set("pincode")}
                      className={inputCls}
                    />
                  </Field>
                </div>
                <Field label="Ship to (only if different from the address)">
                  <textarea
                    value={f.ship_to}
                    onChange={set("ship_to")}
                    rows={2}
                    className={`${inputCls} h-auto py-2`}
                  />
                </Field>
                {f.id && <ContactsList customerId={f.id} />}
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

// People at this customer company: name, role, phone, email; one primary.
function ContactsList({ customerId }: { customerId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["contacts", customerId],
    queryFn: () => listContacts({ data: { customerId } }),
  });
  const [f, setF] = useState<null | {
    id?: string;
    name: string;
    role: string;
    phone: string;
    email: string;
    is_primary: boolean;
  }>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["contacts", customerId] });
    qc.invalidateQueries({ queryKey: ["contacts", "all"] });
  };
  async function save() {
    if (!f?.name.trim()) return void toast.error("Contact name is required");
    try {
      await saveContact({
        data: {
          ...(f.id ? { id: f.id } : {}),
          customer_id: customerId,
          name: f.name,
          role: f.role,
          phone: f.phone,
          email: f.email,
          is_primary: f.is_primary,
        },
      });
      refresh();
      setF(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Contact people · {data?.length ?? 0}
        </p>
        <button
          type="button"
          className="text-xs font-semibold text-primary"
          onClick={() =>
            setF({ name: "", role: "", phone: "", email: "", is_primary: !data?.length })
          }
        >
          + Add
        </button>
      </div>
      <ul className="space-y-1.5">
        {data?.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-2 rounded-xl border border-border p-2 text-sm"
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() =>
                setF({
                  id: c.id,
                  name: c.name,
                  role: c.role ?? "",
                  phone: c.phone ?? "",
                  email: c.email ?? "",
                  is_primary: !!c.is_primary,
                })
              }
            >
              <span className="block truncate font-medium">
                {c.name}
                {c.is_primary ? " · primary" : ""}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {[c.role, c.phone, c.email].filter(Boolean).join(" · ")}
              </span>
            </button>
            {c.phone && (
              <>
                <a
                  href={`tel:${c.phone}`}
                  aria-label={`Call ${c.name}`}
                  className="rounded-full bg-secondary p-1.5 text-primary"
                >
                  <Phone className="h-3.5 w-3.5" />
                </a>
                <a
                  href={wa(c.phone)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`WhatsApp ${c.name}`}
                  className="rounded-full bg-secondary p-1.5 text-primary"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
      {f && (
        <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              placeholder="Name"
              className={`${inputCls} h-10`}
            />
            <input
              value={f.role}
              onChange={(e) => setF({ ...f, role: e.target.value })}
              placeholder="Role (purchase, owner…)"
              className={`${inputCls} h-10`}
            />
            <input
              value={f.phone}
              onChange={(e) => setF({ ...f, phone: e.target.value })}
              inputMode="tel"
              placeholder="Phone"
              className={`${inputCls} h-10`}
            />
            <input
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
              placeholder="Email"
              className={`${inputCls} h-10`}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.is_primary}
              onChange={(e) => setF({ ...f, is_primary: e.target.checked })}
            />{" "}
            Primary contact
          </label>
          <div className="flex gap-2">
            {f.id && (
              <Button
                type="button"
                variant="ghost"
                className="h-9 rounded-lg text-destructive"
                onClick={async () => {
                  if (confirm(`Remove ${f.name}?`)) {
                    await deleteContact({ data: { id: f.id! } });
                    refresh();
                    setF(null);
                  }
                }}
              >
                Remove
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              className="h-9 rounded-lg"
              onClick={() => setF(null)}
            >
              Cancel
            </Button>
            <Button type="button" className="h-9 flex-1 rounded-lg" onClick={save}>
              Save contact
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
