import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutList, Users, Plus, Settings, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/dashboard", label: "Quotes", Icon: LayoutList },
  { to: "/customers", label: "Customers", Icon: Users },
  { to: "/prices", label: "Prices", Icon: Tag },
  { to: "/settings", label: "Brands", Icon: Settings },
] as const;

function useActive() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (p: string) => pathname.startsWith(p);
}

// Mobile: bottom tab bar with a centre "New quote" button. Desktop: nav lives in PageShell's header.
export function BottomNav() {
  const active = useActive();
  const item = (on: boolean) =>
    cn(
      "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
      on ? "text-primary" : "text-muted-foreground hover:text-foreground"
    );
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden">
      <div className="mx-auto flex w-full max-w-md items-stretch px-2 pb-[env(safe-area-inset-bottom)]">
        <Link to="/dashboard" className={item(active("/dashboard"))}>
          <LayoutList className="h-5 w-5" />
          Quotes
        </Link>
        <Link to="/customers" className={item(active("/customers"))}>
          <Users className="h-5 w-5" />
          Customers
        </Link>
        <Link to="/new-quote" className={item(active("/new-quote"))}>
          <span className="-mt-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Plus className="h-6 w-6" />
          </span>
          <span className="-mt-1">New quote</span>
        </Link>
        <Link to="/prices" className={item(active("/prices"))}>
          <Tag className="h-5 w-5" />
          Prices
        </Link>
        <Link to="/settings" className={item(active("/settings"))}>
          <Settings className="h-5 w-5" />
          Brands
        </Link>
      </div>
    </nav>
  );
}

export function PageShell({
  title,
  actions,
  bar,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  bar?: React.ReactNode; // sticky action bar above the mobile tab bar

  children: React.ReactNode;
}) {
  const active = useActive();
  return (
    <div className="min-h-screen bg-background">
      <header className="no-print sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-4 px-4 py-3 md:max-w-5xl">
          <h1 className="text-lg font-bold text-foreground">{title}</h1>
          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map(({ to, label, Icon }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                  active(to) ? "bg-secondary text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
            <Link
              to="/new-quote"
              className="ml-2 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              New quote
            </Link>
          </nav>
          {actions && <div className="md:hidden">{actions}</div>}
        </div>
      </header>
      <main className={cn("mx-auto w-full max-w-md px-4 pt-4 md:max-w-5xl md:pb-10", bar ? "pb-44" : "pb-28")}>{children}</main>
      {bar && (
        <div className="no-print fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-card/95 backdrop-blur md:hidden">
          <div className="mx-auto max-w-md px-4 py-2">{bar}</div>
        </div>
      )}
      <BottomNav />
    </div>
  );
}
