import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// Phone-first primitives: ≥44px tap targets, numeric keypads, no tiny controls.

export function Card({
  title,
  aside,
  children,
  className,
}: {
  title?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-4 shadow-[0_1px_0_rgb(0_0_0/0.02)]",
        className,
      )}
    >
      {(title || aside) && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h2>
          {aside}
        </div>
      )}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "h-12 w-full rounded-xl border border-input bg-background px-3 text-base tabular-nums outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

export function Chips<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; sub?: string }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex h-12 shrink-0 snap-start touch-manipulation flex-col items-center justify-center rounded-xl border px-4 text-sm font-semibold transition-colors",
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground active:bg-secondary",
            )}
          >
            <span className="tabular-nums leading-tight">{o.label}</span>
            {o.sub && (
              <span
                className={cn(
                  "text-[10px] font-normal leading-tight",
                  on ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {o.sub}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 1,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  label: string;
}) {
  const set = (n: number) => onChange(Math.max(min, Math.round(n) || min));
  const btn =
    "flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-border bg-background active:bg-secondary";
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" aria-label="Decrease" className={btn} onClick={() => set(value - 1)}>
        <Minus className="h-5 w-5" />
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => set(+e.target.value.replace(/\D/g, ""))}
        className="h-12 w-full min-w-0 rounded-xl border border-input bg-background text-center text-lg font-semibold tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <button type="button" aria-label="Increase" className={btn} onClick={() => set(value + 1)}>
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-secondary text-secondary-foreground",
  sent: "bg-sky-100 text-sky-800",
  negotiation: "bg-amber-100 text-amber-800",
  won: "bg-emerald-100 text-emerald-800",
  lost: "bg-rose-100 text-rose-800",
};
export function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_STYLE[status])}>
      {label}
    </span>
  );
}
