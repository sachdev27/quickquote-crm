import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  CalendarCheck,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  LayoutGrid,
  List,
  MessageCircle,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/bottom-nav";
import { Card, inputCls } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { ProPagination } from "@/components/pro-pagination";
import { addActivity, listCustomers, listTasks, setActivityDone } from "@/data/api";

export const Route = createFileRoute("/_authenticated/activities")({
  head: () => ({ meta: [{ title: "Activities — Tarko CRM" }] }),
  component: ActivitiesPage,
});

type Task = Awaited<ReturnType<typeof listTasks>>[number];
const day = (n = 0) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const waLink = (p: string) => `https://wa.me/${p.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}`;

type FilterStatus = "all" | "open" | "overdue" | "today" | "upcoming" | "done";
type SortField = "due_date" | "customer" | "text";

function ActivitiesPage() {
  const qc = useQueryClient();
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: () => listTasks(), staleTime: 30_000 });
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => listCustomers(),
    staleTime: 60_000,
  });

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("open");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "grouped">("grid");
  const [sortField, setSortField] = useState<SortField>("due_date");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [form, setForm] = useState({ text: "", due: day(1), customerId: "" });
  const [showAddForm, setShowAddForm] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["followups"] });
  };

  async function add() {
    if (!form.text.trim()) return void toast.error("What needs doing?");
    await addActivity({
      data: {
        kind: "followup",
        text: form.text,
        dueDate: form.due,
        customerId: form.customerId || null,
      },
    });
    setForm({ ...form, text: "" });
    setShowAddForm(false);
    refresh();
    toast.success("Task added");
  }

  async function toggle(t: Task) {
    await setActivityDone({ data: { id: t.a.id, done: !t.a.done } });
    refresh();
  }

  async function snooze(t: Task) {
    await addActivity({
      data: {
        ...(t.a.quote_id
          ? { quoteId: t.a.quote_id }
          : t.a.enquiry_id
            ? { enquiryId: t.a.enquiry_id }
            : { customerId: t.a.customer_id }),
        kind: "followup",
        text: t.a.text,
        dueDate: day(1),
      },
    });
    await setActivityDone({ data: { id: t.a.id, done: true } });
    refresh();
    toast.success("Snoozed to tomorrow");
  }

  const today = day();
  const all = tasks.data ?? [];
  const openTasks = useMemo(() => all.filter((t) => !t.a.done), [all]);
  const overdueTasks = useMemo(() => openTasks.filter((t) => (t.a.due_date ?? "") < today), [openTasks, today]);
  const todayTasks = useMemo(() => openTasks.filter((t) => t.a.due_date === today), [openTasks, today]);
  const upcomingTasks = useMemo(() => openTasks.filter((t) => (t.a.due_date ?? "") > today), [openTasks, today]);
  const doneTasks = useMemo(() => all.filter((t) => t.a.done), [all]);

  // Filtering
  const filtered = useMemo(() => {
    return all.filter((t) => {
      // Search text
      const searchMatch =
        !q.trim() ||
        `${t.a.text ?? ""} ${t.customer ?? ""} ${t.quote_no ?? ""} ${t.enquiry ?? ""}`
          .toLowerCase()
          .includes(q.toLowerCase());
      if (!searchMatch) return false;

      // Customer filter
      if (customerFilter !== "all" && t.a.customer_id !== customerFilter) {
        return false;
      }

      // Status filter
      if (filterStatus === "open") return !t.a.done;
      if (filterStatus === "overdue") return !t.a.done && (t.a.due_date ?? "") < today;
      if (filterStatus === "today") return !t.a.done && t.a.due_date === today;
      if (filterStatus === "upcoming") return !t.a.done && (t.a.due_date ?? "") > today;
      if (filterStatus === "done") return t.a.done;

      return true; // "all"
    });
  }, [all, q, customerFilter, filterStatus, today]);

  // Sorting
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let diff = 0;
      if (sortField === "due_date") {
        diff = (a.a.due_date ?? "").localeCompare(b.a.due_date ?? "");
      } else if (sortField === "customer") {
        diff = (a.customer ?? "").localeCompare(b.customer ?? "");
      } else if (sortField === "text") {
        diff = (a.a.text ?? "").localeCompare(b.a.text ?? "");
      }
      return sortAsc ? diff : -diff;
    });
  }, [filtered, sortField, sortAsc]);

  // Pagination
  const totalPages = Math.ceil(sorted.length / pageSize) || 1;
  const paginatedTasks = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  const handleFilterChange = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === "due_date");
    }
  };

  // Grouped breakdown for grouped board view
  const groupedSections: [string, Task[], string][] = [
    ["Overdue", overdueTasks, "text-rose-600 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900"],
    ["Today", todayTasks, "text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900"],
    ["Upcoming", upcomingTasks, "text-foreground bg-secondary/40 border-border"],
    ...(filterStatus === "all" || filterStatus === "done"
      ? ([
          ["Completed (Last 30 Days)", doneTasks.slice(0, 50), "text-muted-foreground bg-secondary/20 border-border"],
        ] as [string, Task[], string][])
      : []),
  ];

  return (
    <PageShell title="Activities" wide>
      {/* KPI Cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-3">
        <div
          onClick={() => handleFilterChange(() => setFilterStatus("overdue"))}
          className={`cursor-pointer rounded-2xl border p-3.5 transition-all shadow-sm ${
            filterStatus === "overdue"
              ? "border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 ring-2 ring-rose-500/30"
              : "border-border bg-card hover:bg-secondary/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-600">Overdue</span>
            <AlertCircle className="h-4 w-4 text-rose-600" />
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-rose-700 dark:text-rose-400">
            {overdueTasks.length}
          </p>
          <p className="text-[11px] text-muted-foreground">Action required</p>
        </div>

        <div
          onClick={() => handleFilterChange(() => setFilterStatus("today"))}
          className={`cursor-pointer rounded-2xl border p-3.5 transition-all shadow-sm ${
            filterStatus === "today"
              ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 ring-2 ring-amber-500/30"
              : "border-border bg-card hover:bg-secondary/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">Due Today</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
            {todayTasks.length}
          </p>
          <p className="text-[11px] text-muted-foreground">Today's priority</p>
        </div>

        <div
          onClick={() => handleFilterChange(() => setFilterStatus("upcoming"))}
          className={`cursor-pointer rounded-2xl border p-3.5 transition-all shadow-sm ${
            filterStatus === "upcoming"
              ? "border-primary bg-primary/5 ring-2 ring-primary/30"
              : "border-border bg-card hover:bg-secondary/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Upcoming</span>
            <Calendar className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {upcomingTasks.length}
          </p>
          <p className="text-[11px] text-muted-foreground">Scheduled ahead</p>
        </div>

        <div
          onClick={() => handleFilterChange(() => setFilterStatus("done"))}
          className={`cursor-pointer rounded-2xl border p-3.5 transition-all shadow-sm ${
            filterStatus === "done"
              ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 ring-2 ring-emerald-500/30"
              : "border-border bg-card hover:bg-secondary/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Completed</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {doneTasks.length}
          </p>
          <p className="text-[11px] text-muted-foreground">Resolved tasks</p>
        </div>
      </div>

      {/* Add Task Box */}
      <div className="mb-4 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 text-sm font-bold text-foreground hover:text-primary transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Plus className="h-4 w-4" />
            </div>
            <span>Create new follow-up or task</span>
          </button>
          {!showAddForm && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Click to quickly record action items
            </span>
          )}
        </div>

        {showAddForm && (
          <div className="mt-3 flex flex-col gap-2 pt-2 border-t border-border sm:flex-row">
            <input
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="e.g. Call Patil Agro regarding discount on 63mm pipe..."
              className={`${inputCls} flex-1 text-xs`}
            />
            <select
              value={form.customerId}
              onChange={(e) => setForm({ ...form, customerId: e.target.value })}
              className={`${inputCls} text-xs sm:w-48`}
              aria-label="Customer"
            >
              <option value="">No customer</option>
              {customers.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={form.due}
              onChange={(e) => setForm({ ...form, due: e.target.value })}
              className={`${inputCls} text-xs sm:w-36`}
              aria-label="Due date"
            >
            </input>
            <div className="flex gap-2">
              <Button className="h-10 rounded-xl px-4 text-xs font-semibold" onClick={add}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Save
              </Button>
              <Button
                variant="ghost"
                className="h-10 rounded-xl px-3 text-xs"
                onClick={() => setShowAddForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Pro Toolbar & Filters */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border bg-card p-2.5 shadow-sm">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative min-w-[13rem] flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search tasks, customers, quotes..."
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

          {/* Status Tabs */}
          <div className="flex items-center rounded-xl border border-border bg-background p-0.5 text-xs">
            {(
              [
                { id: "open", label: "Open", count: openTasks.length },
                { id: "overdue", label: "Overdue", count: overdueTasks.length },
                { id: "today", label: "Today", count: todayTasks.length },
                { id: "upcoming", label: "Upcoming", count: upcomingTasks.length },
                { id: "done", label: "Done", count: doneTasks.length },
                { id: "all", label: "All", count: all.length },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleFilterChange(() => setFilterStatus(tab.id))}
                className={`rounded-lg px-2.5 py-1 font-semibold transition-colors flex items-center gap-1.5 ${
                  filterStatus === tab.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] tabular-nums px-1 rounded-full ${
                    filterStatus === tab.id
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Customer Dropdown */}
          <select
            aria-label="Filter by customer"
            value={customerFilter}
            onChange={(e) => handleFilterChange(() => setCustomerFilter(e.target.value))}
            className="h-9 rounded-xl border border-border bg-background px-2.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Customers</option>
            {customers.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 border-l border-border pl-2.5">
          <button
            type="button"
            title="Grid / Table View"
            onClick={() => setViewMode("grid")}
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              viewMode === "grid"
                ? "bg-secondary text-primary font-bold shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Grouped Cards View"
            onClick={() => setViewMode("grouped")}
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              viewMode === "grouped"
                ? "bg-secondary text-primary font-bold shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {tasks.isLoading && <div className="h-40 animate-pulse rounded-2xl bg-secondary" />}

      {/* Empty State */}
      {!tasks.isLoading && sorted.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-12 text-center">
          <CalendarCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground opacity-60" />
          <p className="font-semibold text-foreground">No activities found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {q || customerFilter !== "all" || filterStatus !== "open"
              ? "No tasks match the active filters. Try clearing search or status filters."
              : "Great job! All follow-ups are up to date."}
          </p>
        </div>
      )}

      {/* PRO GRID / TABLE VIEW */}
      {!tasks.isLoading && sorted.length > 0 && viewMode === "grid" && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="border-b border-border bg-secondary/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-3 text-center">Done</th>
                  <th
                    className="cursor-pointer px-3 py-3 hover:text-foreground"
                    onClick={() => toggleSort("text")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Task Description</span>
                      {sortField === "text" ? (
                        sortAsc ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </div>
                  </th>
                  <th
                    className="cursor-pointer px-3 py-3 hover:text-foreground"
                    onClick={() => toggleSort("customer")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Customer</span>
                      {sortField === "customer" ? (
                        sortAsc ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </div>
                  </th>
                  <th
                    className="cursor-pointer px-3 py-3 hover:text-foreground"
                    onClick={() => toggleSort("due_date")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Due Date</span>
                      {sortField === "due_date" ? (
                        sortAsc ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </div>
                  </th>
                  <th className="px-3 py-3">Linked Context</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {paginatedTasks.map((t) => {
                  const isDone = !!t.a.done;
                  const isOverdue = !isDone && (t.a.due_date ?? "") < today;
                  const isToday = !isDone && t.a.due_date === today;

                  return (
                    <tr
                      key={t.a.id}
                      className={`transition-colors ${
                        isDone ? "bg-secondary/20 opacity-70" : "hover:bg-secondary/40"
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          aria-label={isDone ? "Mark incomplete" : "Mark completed"}
                          onClick={() => toggle(t)}
                          className={`inline-flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
                            isDone
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : "border-border hover:border-primary hover:bg-primary/10"
                          }`}
                        >
                          {isDone && <Check className="h-3 w-3" />}
                        </button>
                      </td>

                      {/* Task Text */}
                      <td className="px-3 py-3">
                        <span
                          className={`text-sm ${
                            isDone ? "line-through text-muted-foreground" : "font-semibold text-foreground"
                          }`}
                        >
                          {t.a.text || "Follow up"}
                        </span>
                      </td>

                      {/* Customer */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {t.customer ? (
                          <span className="font-medium text-foreground">{t.customer}</span>
                        ) : (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </td>

                      {/* Due Date & Pill */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{t.a.due_date}</span>
                          {isOverdue && (
                            <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                              Overdue
                            </span>
                          )}
                          {isToday && (
                            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              Today
                            </span>
                          )}
                          {!isOverdue && !isToday && !isDone && (
                            <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border">
                              Upcoming
                            </span>
                          )}
                          {isDone && (
                            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              Done
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Linked Context */}
                      <td className="px-3 py-3 whitespace-nowrap text-xs">
                        {t.a.quote_id && t.quote_no && (
                          <Link
                            to="/quotes/$id"
                            params={{ id: t.a.quote_id }}
                            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {t.quote_no}
                          </Link>
                        )}
                        {t.a.enquiry_id && t.enquiry && (
                          <Link
                            to="/dashboard"
                            search={{ view: "pipeline", enquiry: t.a.enquiry_id }}
                            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {t.enquiry}
                          </Link>
                        )}
                        {!t.a.quote_id && !t.a.enquiry_id && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {t.phone && !isDone && (
                            <>
                              <a
                                href={`tel:${t.phone}`}
                                title="Call customer"
                                aria-label="Call"
                                className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-primary hover:bg-secondary/80"
                              >
                                <Phone className="h-3.5 w-3.5" />
                              </a>
                              <a
                                href={waLink(t.phone)}
                                target="_blank"
                                rel="noreferrer"
                                title="WhatsApp customer"
                                aria-label="WhatsApp"
                                className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-primary hover:bg-secondary/80"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </a>
                            </>
                          )}
                          {!isDone && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Snooze to tomorrow"
                              onClick={() => snooze(t)}
                              className="h-8 gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span className="hidden xl:inline">+1d</span>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pro Pagination */}
          <ProPagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={sorted.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemName="activities"
          />
        </div>
      )}

      {/* GROUPED CARDS VIEW */}
      {!tasks.isLoading && sorted.length > 0 && viewMode === "grouped" && (
        <div className="space-y-4">
          {groupedSections.map(([title, items, tone]) =>
            items.length ? (
              <Card key={title} className="overflow-hidden">
                <div className={`-mx-4 -mt-4 mb-3 px-4 py-2 border-b text-xs font-bold uppercase tracking-wider ${tone}`}>
                  {title} · {items.length}
                </div>
                <ul className="divide-y divide-border/60">
                  {items.map((t) => (
                    <li key={t.a.id} className="flex items-start gap-3 py-2.5">
                      <button
                        type="button"
                        aria-label={t.a.done ? "Mark not done" : "Mark done"}
                        onClick={() => toggle(t)}
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                          t.a.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-border hover:border-primary"
                        }`}
                      >
                        {t.a.done ? <Check className="h-3.5 w-3.5" /> : null}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${t.a.done ? "text-muted-foreground line-through" : "font-medium"}`}>
                          {t.a.text || "Follow up"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t.a.due_date}
                          {t.customer && ` · ${t.customer}`}
                          {t.a.quote_id && t.quote_no && (
                            <>
                              {" · "}
                              <Link
                                to="/quotes/$id"
                                params={{ id: t.a.quote_id }}
                                className="text-primary hover:underline font-medium"
                              >
                                {t.quote_no}
                              </Link>
                            </>
                          )}
                          {t.a.enquiry_id && t.enquiry && (
                            <>
                              {" · "}
                              <Link
                                to="/dashboard"
                                search={{ view: "pipeline", enquiry: t.a.enquiry_id }}
                                className="text-primary hover:underline font-medium"
                              >
                                {t.enquiry}
                              </Link>
                            </>
                          )}
                        </p>
                      </div>
                      {t.phone && !t.a.done && (
                        <div className="flex shrink-0 gap-1">
                          <a
                            href={`tel:${t.phone}`}
                            aria-label="Call"
                            className="rounded-full bg-secondary p-2 text-primary"
                          >
                            <Phone className="h-4 w-4" />
                          </a>
                          <a
                            href={waLink(t.phone)}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="WhatsApp"
                            className="rounded-full bg-secondary p-2 text-primary"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        </div>
                      )}
                      {!t.a.done && (
                        <button
                          type="button"
                          title="Snooze to tomorrow"
                          aria-label="Snooze to tomorrow"
                          className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
                          onClick={() => snooze(t)}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null,
          )}
        </div>
      )}
    </PageShell>
  );
}
