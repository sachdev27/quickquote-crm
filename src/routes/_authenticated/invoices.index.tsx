import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/bottom-nav";
import { inputSm } from "@/components/qq";
import { listInvoices } from "@/data/api";
import { fmtDate } from "@/lib/quote-doc";
import { fmtMoney } from "@/lib/quote";

export const Route = createFileRoute("/_authenticated/invoices/")({
  head: () => ({ meta: [{ title: "Invoices — Tarko CRM" }] }),
  component: Invoices,
});

function Invoices() {
  const [q, setQ] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => listInvoices(),
    staleTime: 30_000,
  });
  const rows = (data ?? []).filter((r) =>
    `${r.invoice_no} ${r.customer_name ?? ""} ${r.brand_name ?? ""}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  const sum = rows.reduce((s, r) => s + r.total, 0);
  return (
    <PageShell title="Tax invoices" wide>
      <div className="mb-3 flex flex-wrap items-center gap-3 lg:mb-2">
        <input
          placeholder="Search invoice, customer or brand"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${inputSm} min-w-[12rem] flex-1 lg:max-w-xs`}
        />
        <p className="text-sm text-muted-foreground tabular-nums">
          {rows.length} invoice{rows.length === 1 ? "" : "s"} · <b>{fmtMoney(sum)}</b>
        </p>
      </div>
      {isLoading && <div className="h-32 animate-pulse rounded-2xl bg-secondary" />}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {data && rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {data.length === 0
            ? "No tax invoices yet. Open a quotation and choose “Create tax invoice”."
            : "No invoices match your search."}
        </p>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full tabular-nums">
            <thead className="border-b border-border bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Invoice</th>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Customer</th>
                <th className="px-3 py-2 font-semibold">Brand</th>
                <th className="px-3 py-2 text-right font-semibold">Total</th>
                <th className="px-3 py-2 font-semibold">Quotation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50 text-sm hover:bg-secondary/50">
                  <td className="px-3 py-1.5 font-semibold">
                    <Link to="/invoices/$id" params={{ id: r.id }} className="hover:text-primary">
                      {r.invoice_no}
                    </Link>
                  </td>
                  <td className="px-3 text-muted-foreground">{fmtDate(r.invoice_date)}</td>
                  <td className="px-3">
                    {r.customer_name ?? <span className="text-muted-foreground">Walk-in</span>}
                  </td>
                  <td className="px-3 text-muted-foreground">{r.brand_name}</td>
                  <td className="px-3 text-right font-semibold">{fmtMoney(r.total)}</td>
                  <td className="px-3">
                    <Link
                      to="/quotes/$id"
                      params={{ id: r.quote_id }}
                      className="text-primary hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
