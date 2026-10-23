import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/bottom-nav";
import { Card } from "@/components/qq";
import { listEnquiries, listQuotes } from "@/data/api";
import { STATUS_LABELS, fmtMoney } from "@/lib/quote";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({ meta: [{ title: "Dashboard — Tarko CRM" }] }),
  component: Insights,
});

const ym = (d: string) => d.slice(0, 7);
const monthLabel = (k: string) =>
  new Date(`${k}-01T00:00:00`).toLocaleString("en-IN", { month: "short", year: "2-digit" });
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

function Bars({ rows, tone = "bg-primary" }: { rows: [string, number, string?][]; tone?: string }) {
  const max = Math.max(1, ...rows.map(([, v]) => v));
  if (!rows.length) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  return (
    <ul className="space-y-2">
      {rows.map(([k, v, sub]) => (
        <li key={k} className="text-sm">
          <div className="flex justify-between gap-3 tabular-nums">
            <span className="truncate">
              {k}
              {sub && <span className="text-xs text-muted-foreground"> · {sub}</span>}
            </span>
            <b className="shrink-0">{fmtMoney(v)}</b>
          </div>
          <div className="mt-1 h-2 rounded-full bg-secondary">
            <div className={`h-2 rounded-full ${tone}`} style={{ width: `${(v / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Sales overview: what's won, what's in play, who's selling, and what's stuck.
function Insights() {
  const quotes = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes(), staleTime: 30_000 });
  const enq = useQuery({
    queryKey: ["enquiries"],
    queryFn: () => listEnquiries(),
    staleTime: 30_000,
  });
  const q = quotes.data ?? [];
  const e = enq.data ?? [];
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const months = Array.from(
    { length: 6 },
    (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1),
  ).map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);

  const won = q.filter((x) => x.status === "won");
  const lost = q.filter((x) => x.status === "lost");
  const openQ = q.filter((x) => ["draft", "sent", "negotiation"].includes(x.status));
  const openE = e.filter((x) => x.e.status === "open");
  const wonMonth = won.filter((x) => ym(x.quote_date) === thisMonth);
  const conversion =
    won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null;
  const avgDeal = won.length ? sum(won, (x) => x.total) / won.length : 0;

  const group = <T,>(xs: T[], key: (x: T) => string, val: (x: T) => number) =>
    Object.entries(
      xs.reduce<Record<string, number>>(
        (m, x) => ({ ...m, [key(x)]: (m[key(x)] ?? 0) + val(x) }),
        {},
      ),
    ).sort((a, b) => b[1] - a[1]);

  const byMonth: [string, number, string][] = months.map((m) => {
    const w = won.filter((x) => ym(x.quote_date) === m);
    return [monthLabel(m), sum(w, (x) => x.total), `${w.length} won`];
  });
  const people = [...new Set(q.map((x) => x.created_by ?? "—"))]
    .map((p) => {
      const mine = q.filter((x) => (x.created_by ?? "—") === p);
      const w = mine.filter((x) => x.status === "won");
      const closed = w.length + mine.filter((x) => x.status === "lost").length;
      return {
        p,
        quotes: mine.length,
        won: sum(w, (x) => x.total),
        conv: closed ? Math.round((w.length / closed) * 100) : null,
      };
    })
    .sort((a, b) => b.won - a.won);
  const stuckDays = 7;
  const stuck = openQ
    .filter(
      (x) =>
        x.status !== "draft" && (Date.now() - new Date(x.updated_at).getTime()) / 864e5 > stuckDays,
    )
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at));

  const kpi = (label: string, value: string, tone = "") => (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );

  return (
    <PageShell title="Dashboard" wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpi(
            `Won this month · ${wonMonth.length}`,
            fmtMoney(sum(wonMonth, (x) => x.total)),
            "text-emerald-700",
          )}
          {kpi(
            `Open pipeline · ${openQ.length} quotes + ${openE.length} enquiries`,
            fmtMoney(sum(openQ, (x) => x.total) + sum(openE, (x) => x.e.expected_value)),
          )}
          {kpi("Conversion (won / closed)", conversion == null ? "—" : `${conversion}%`)}
          {kpi("Average won deal", fmtMoney(avgDeal))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Won ₹ by month">
            <div className="flex h-44 items-end gap-2">
              {byMonth.map(([m, v, sub]) => {
                const max = Math.max(1, ...byMonth.map(([, x]) => x));
                return (
                  <div
                    key={m}
                    className="flex flex-1 flex-col items-center gap-1"
                    title={`${m}: ${fmtMoney(v)} (${sub})`}
                  >
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {v ? fmtMoney(Math.round(v / 1000)) + "k" : ""}
                    </span>
                    <div
                      className="w-full rounded-t-md bg-emerald-600"
                      style={{ height: `${Math.max(2, (v / max) * 120)}px` }}
                    />
                    <span className="text-xs text-muted-foreground">{m}</span>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card title="Funnel">
            {[
              ["Open enquiries", openE.length, sum(openE, (x) => x.e.expected_value)],
              ["Quotes in play", openQ.length, sum(openQ, (x) => x.total)],
              ["Won", won.length, sum(won, (x) => x.total)],
              [
                "Lost",
                lost.length + e.filter((x) => x.e.status === "lost").length,
                sum(lost, (x) => x.total),
              ],
            ].map(([label, n, v]) => (
              <div
                key={label as string}
                className="flex items-center justify-between border-b border-border/60 py-2 text-sm last:border-0"
              >
                <span>{label}</span>
                <span className="tabular-nums">
                  <b>{n as number}</b>{" "}
                  <span className="text-muted-foreground">· {fmtMoney(v as number)}</span>
                </span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Enquiries converted to quotes: {e.filter((x) => x.e.status === "converted").length}
            </p>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="By salesperson">
            {people.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
            <ul className="divide-y divide-border/60">
              {people.map((x) => (
                <li key={x.p} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate">{x.p}</span>
                  <span className="shrink-0 text-right tabular-nums">
                    <b>{fmtMoney(x.won)}</b>
                    <span className="block text-xs text-muted-foreground">
                      {x.quotes} quotes · {x.conv == null ? "—" : `${x.conv}%`} conv.
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Won by brand">
            <Bars
              rows={group(
                won,
                (x) => x.brand_name ?? "—",
                (x) => x.total,
              ).map(([k, v]) => [k, v])}
              tone="bg-emerald-600"
            />
          </Card>
          <Card title="Top customers (won)">
            <Bars
              rows={group(
                won,
                (x) => x.customer_name ?? "Walk-in",
                (x) => x.total,
              )
                .slice(0, 8)
                .map(([k, v]) => [k, v])}
            />
          </Card>
        </div>

        <Card title={`Stuck deals · no movement for ${stuckDays}+ days`}>
          {stuck.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing stuck. 👍</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {stuck.map((x) => (
                <li key={x.id}>
                  <Link
                    to="/quotes/$id"
                    params={{ id: x.id }}
                    className="flex items-center justify-between gap-3 py-2 text-sm hover:text-primary"
                  >
                    <span className="min-w-0 truncate">
                      <b>{x.customer_name ?? "Walk-in"}</b> · {x.quote_no} ·{" "}
                      {STATUS_LABELS[x.status]}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {Math.floor((Date.now() - new Date(x.updated_at).getTime()) / 864e5)} days ·{" "}
                      <b className="text-foreground">{fmtMoney(x.total)}</b>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
