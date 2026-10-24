import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  Calendar,
  DollarSign,
  Download,
  ExternalLink,
  FileCheck,
  FileText,
  Filter,
  Search,
  X,
} from "lucide-react";
import { PageShell } from "@/components/bottom-nav";
import { ProPagination } from "@/components/pro-pagination";
import { Button } from "@/components/ui/button";
import { listInvoices } from "@/data/api";
import { fmtDate } from "@/lib/quote-doc";
import { fmtMoney } from "@/lib/quote";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/invoices/")({
  head: () => ({ meta: [{ title: "Invoices — Tarko CRM" }] }),
  component: InvoicesPage,
});

type InvoiceRow = Awaited<ReturnType<typeof listInvoices>>[number];
type SortField = "invoice_no" | "invoice_date" | "customer_name" | "brand_name" | "total";
type SortOrder = "asc" | "desc";

function InvoicesPage() {
  const [q, setQ] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"all" | "this-month" | "last-month" | "last-90">("all");
  const [sortField, setSortField] = useState<SortField>("invoice_date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading, error } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => listInvoices(),
    staleTime: 30_000,
  });

  const all = data ?? [];

  // Distinct brands for filter dropdown
  const brands = useMemo(() => {
    return Array.from(new Set(all.map((r) => r.brand_name).filter((b): b is string => !!b))).sort();
  }, [all]);

  // Date boundary helpers
  const filteredRows = useMemo(() => {
    const now = new Date();
    const currentYearMonth = now.toISOString().slice(0, 7);
    
    // Previous month string
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYearMonth = prevMonthDate.toISOString().slice(0, 7);

    // 90 days ago string
    const ninetyDaysAgo = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);

    return all.filter((r) => {
      // Search
      const searchMatch =
        !q.trim() ||
        `${r.invoice_no} ${r.customer_name ?? ""} ${r.brand_name ?? ""}`
          .toLowerCase()
          .includes(q.toLowerCase());
      if (!searchMatch) return false;

      // Brand filter
      if (brandFilter !== "all" && r.brand_name !== brandFilter) return false;

      // Date filter
      if (dateFilter === "this-month" && !r.invoice_date.startsWith(currentYearMonth)) {
        return false;
      }
      if (dateFilter === "last-month" && !r.invoice_date.startsWith(prevYearMonth)) {
        return false;
      }
      if (dateFilter === "last-90" && r.invoice_date < ninetyDaysAgo) {
        return false;
      }

      return true;
    });
  }, [all, q, brandFilter, dateFilter]);

  // Sorting
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      let valA = a[sortField] ?? "";
      let valB = b[sortField] ?? "";

      if (sortField === "total") {
        return sortOrder === "asc" ? (a.total - b.total) : (b.total - a.total);
      }

      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      return 0;
    });
  }, [filteredRows, sortField, sortOrder]);

  // Pagination slice
  const totalPages = Math.ceil(sortedRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  // Reset page when filters change
  const handleFilterChange = (setter: () => void) => {
    setter();
    setPage(1);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder(field === "total" || field === "invoice_date" ? "desc" : "asc");
    }
  };

  // KPI Calculations
  const totalValue = useMemo(() => filteredRows.reduce((s, r) => s + r.total, 0), [filteredRows]);
  const avgValue = filteredRows.length > 0 ? Math.round(totalValue / filteredRows.length) : 0;
  const uniqueCustomers = useMemo(
    () => new Set(filteredRows.map((r) => r.customer_name).filter(Boolean)).size,
    [filteredRows],
  );

  const clearAllFilters = () => {
    setQ("");
    setBrandFilter("all");
    setDateFilter("all");
    setPage(1);
  };

  const hasActiveFilters = q || brandFilter !== "all" || dateFilter !== "all";

  return (
    <PageShell title="Tax invoices" wide>
      {/* KPI Cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-3">
        <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Invoices</span>
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {filteredRows.length}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {all.length !== filteredRows.length ? `Filtered from ${all.length}` : "Total created"}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Total Value</span>
            <span className="text-emerald-600 font-bold text-sm">₹</span>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {fmtMoney(totalValue)}
          </p>
          <p className="text-[11px] text-muted-foreground">Sum of invoice amounts</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Avg Ticket</span>
            <span className="text-blue-500 font-bold text-sm">Ø</span>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {fmtMoney(avgValue)}
          </p>
          <p className="text-[11px] text-muted-foreground">Per tax invoice</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Customers</span>
            <Building2 className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {uniqueCustomers}
          </p>
          <p className="text-[11px] text-muted-foreground">Distinct buyers billed</p>
        </div>
      </div>

      {/* Pro Filter Toolbar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border bg-card p-2.5 shadow-sm">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search Box */}
          <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search invoice #, customer, brand..."
              value={q}
              onChange={(e) => handleFilterChange(() => setQ(e.target.value))}
              className="h-9 w-full rounded-xl border border-border bg-background pl-9 pr-8 text-xs font-medium placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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

          {/* Brand Filter */}
          <div className="flex items-center gap-1.5">
            <select
              aria-label="Filter by brand"
              value={brandFilter}
              onChange={(e) => handleFilterChange(() => setBrandFilter(e.target.value))}
              className="h-9 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-1">
            <select
              aria-label="Filter by date"
              value={dateFilter}
              onChange={(e) =>
                handleFilterChange(() =>
                  setDateFilter(e.target.value as "all" | "this-month" | "last-month" | "last-90"),
                )
              }
              className="h-9 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Dates</option>
              <option value="this-month">This Month</option>
              <option value="last-month">Last Month</option>
              <option value="last-90">Last 90 Days</option>
            </select>
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="h-9 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>

        {/* Page size helper */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Showing:</span>
          <span className="font-semibold tabular-nums text-foreground">
            {sortedRows.length} result{sortedRows.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* Loading & Error States */}
      {isLoading && (
        <div className="space-y-2">
          <div className="h-12 animate-pulse rounded-xl bg-secondary" />
          <div className="h-64 animate-pulse rounded-xl bg-secondary/60" />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {/* Empty State */}
      {!isLoading && data && sortedRows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <FileText className="h-6 w-6" />
          </div>
          <p className="font-semibold text-foreground">
            {hasActiveFilters ? "No invoices match the selected filters" : "No tax invoices created yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasActiveFilters
              ? "Try resetting your search query or brand/date filters."
              : "Open any won quotation and choose 'Create tax invoice' to generate invoices."}
          </p>
          {hasActiveFilters ? (
            <Button variant="outline" size="sm" onClick={clearAllFilters} className="mt-4 rounded-xl">
              Reset Filters
            </Button>
          ) : (
            <Button asChild size="sm" className="mt-4 rounded-xl">
              <Link to="/dashboard">Go to Quotes</Link>
            </Button>
          )}
        </div>
      )}

      {/* Pro Grid / Table */}
      {!isLoading && sortedRows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="border-b border-border bg-secondary/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th
                    className="cursor-pointer px-4 py-3 hover:text-foreground"
                    onClick={() => toggleSort("invoice_no")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Invoice</span>
                      {sortField === "invoice_no" ? (
                        sortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5 text-primary" /> : <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </div>
                  </th>
                  <th
                    className="cursor-pointer px-3 py-3 hover:text-foreground"
                    onClick={() => toggleSort("invoice_date")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Date</span>
                      {sortField === "invoice_date" ? (
                        sortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5 text-primary" /> : <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </div>
                  </th>
                  <th
                    className="cursor-pointer px-3 py-3 hover:text-foreground"
                    onClick={() => toggleSort("customer_name")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Customer</span>
                      {sortField === "customer_name" ? (
                        sortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5 text-primary" /> : <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </div>
                  </th>
                  <th
                    className="cursor-pointer px-3 py-3 hover:text-foreground"
                    onClick={() => toggleSort("brand_name")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Brand</span>
                      {sortField === "brand_name" ? (
                        sortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5 text-primary" /> : <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </div>
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-right hover:text-foreground"
                    onClick={() => toggleSort("total")}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Total Amount</span>
                      {sortField === "total" ? (
                        sortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5 text-primary" /> : <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {paginatedRows.map((r) => (
                  <tr
                    key={r.id}
                    className="transition-colors hover:bg-secondary/40 group"
                  >
                    <td className="px-4 py-3 font-semibold text-foreground">
                      <Link
                        to="/invoices/$id"
                        params={{ id: r.id }}
                        className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline"
                      >
                        <FileText className="h-4 w-4 opacity-70" />
                        {r.invoice_no}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                      {fmtDate(r.invoice_date)}
                    </td>
                    <td className="px-3 py-3 font-medium text-foreground">
                      {r.customer_name ? (
                        <span>{r.customer_name}</span>
                      ) : (
                        <span className="italic text-muted-foreground">Walk-in customer</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {r.brand_name ? (
                        <span className="inline-flex items-center rounded-lg bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground border border-border">
                          {r.brand_name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-foreground">
                      {fmtMoney(r.total)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          to="/invoices/$id"
                          params={{ id: r.id }}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-secondary"
                        >
                          View
                        </Link>
                        {r.quote_id && (
                          <Link
                            to="/quotes/$id"
                            params={{ id: r.quote_id }}
                            title="View source quote"
                            className="inline-flex items-center gap-1 rounded-lg bg-secondary/80 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span className="hidden md:inline">Quote</span>
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pro Pagination */}
          <ProPagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={sortedRows.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[10, 25, 50, 100]}
            itemName="invoices"
          />
        </div>
      )}
    </PageShell>
  );
}
