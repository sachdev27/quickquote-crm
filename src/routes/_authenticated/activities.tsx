import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageCircle, Phone, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/bottom-nav";
import { Card, Chips, inputCls } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { addActivity, listCustomers, listTasks, setActivityDone } from "@/data/api";

export const Route = createFileRoute("/_authenticated/activities")({
  head: () => ({ meta: [{ title: "Activities — Tarko CRM" }] }),
  component: ActivitiesPage,
});

type Task = Awaited<ReturnType<typeof listTasks>>[number];
const day = (n = 0) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const waLink = (p: string) => `https://wa.me/${p.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}`;

// Everyone's to-do list: all follow-ups and tasks, the screen the sales team opens each morning.
function ActivitiesPage() {
  const qc = useQueryClient();
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: () => listTasks(), staleTime: 30_000 });
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => listCustomers(),
    staleTime: 60_000,
  });
  const [mine, setMine] = useState<"all" | "open">("open");
  const [form, setForm] = useState({ text: "", due: day(1), customerId: "" });
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
    refresh();
  }
  async function toggle(t: Task) {
    await setActivityDone({ data: { id: t.a.id, done: !t.a.done } });
    refresh();
  }

  const today = day();
  const all = tasks.data ?? [];
  const open = all.filter((t) => !t.a.done);
  const groups: [string, Task[], string][] = [
    ["Overdue", open.filter((t) => t.a.due_date! < today), "text-rose-700"],
    ["Today", open.filter((t) => t.a.due_date === today), "text-amber-700"],
    ["Upcoming", open.filter((t) => t.a.due_date! > today), "text-foreground"],
    ...(mine === "all"
      ? ([
          ["Done (last 30 days)", all.filter((t) => t.a.done).reverse(), "text-muted-foreground"],
        ] as [string, Task[], string][])
      : []),
  ];

  const row = (t: Task) => (
    <li key={t.a.id} className="flex items-start gap-3 py-2.5">
      <button
        type="button"
        aria-label={t.a.done ? "Mark not done" : "Mark done"}
        onClick={() => toggle(t)}
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${t.a.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-border hover:border-primary"}`}
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
                className="text-primary hover:underline"
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
                className="text-primary hover:underline"
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
          onClick={async () => {
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
          }}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      )}
    </li>
  );

  return (
    <PageShell title="Activities" wide>
      <div className="mx-auto max-w-3xl space-y-4">
        <Card title="Add a task">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="e.g. Send revised rate to Patil Agro"
              className={`${inputCls} flex-1`}
            />
            <select
              value={form.customerId}
              onChange={(e) => setForm({ ...form, customerId: e.target.value })}
              className={`${inputCls} sm:w-48`}
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
              className={`${inputCls} sm:w-40`}
              aria-label="Due date"
            />
            <Button className="h-12 rounded-xl" onClick={add}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        </Card>

        <Chips
          label="Show"
          value={mine}
          onChange={setMine}
          options={[
            { value: "open" as const, label: `Open · ${open.length}` },
            { value: "all" as const, label: "Include done" },
          ]}
        />

        {tasks.isLoading && <div className="h-40 animate-pulse rounded-2xl bg-secondary" />}
        {tasks.data && open.length === 0 && mine === "open" && (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No open follow-ups. Add one above, or from any quote or enquiry.
          </p>
        )}
        {groups.map(([title, items, tone]) =>
          items.length ? (
            <Card key={title}>
              <p className={`text-xs font-semibold uppercase tracking-wider ${tone}`}>
                {title} · {items.length}
              </p>
              <ul className="divide-y divide-border/60">{items.map(row)}</ul>
            </Card>
          ) : null,
        )}
      </div>
    </PageShell>
  );
}
