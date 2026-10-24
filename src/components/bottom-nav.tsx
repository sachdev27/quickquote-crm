import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  BarChart3,
  Calculator,
  CalendarCheck,
  FileText,
  LayoutList,
  Plus,
  Search,
  Settings,
  Sparkles,
  Tag,
  Users,
} from "lucide-react";
import { CommandPalette, openSearch } from "@/components/command-palette";
import { cn } from "@/lib/utils";
import { useMe } from "@/hooks/use-me";

const LINKS = [
  { to: "/dashboard", label: "Quotes", Icon: LayoutList },
  { to: "/insights", label: "Dashboard", Icon: BarChart3 },
  { to: "/invoices", label: "Invoices", Icon: FileText },
  { to: "/activities", label: "Activities", Icon: CalendarCheck },
  { to: "/price-extractor", label: "Extractor", Icon: Calculator },
  { to: "/ai-quote", label: "AI Quote", Icon: Sparkles },
  { to: "/customers", label: "Customers", Icon: Users },
  { to: "/products", label: "Products", Icon: Tag },
  { to: "/settings", label: "Settings", Icon: Settings },
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
      on ? "text-primary" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden">
      <div className="mx-auto flex w-full max-w-md items-stretch px-2 pb-[env(safe-area-inset-bottom)]">
        <Link to="/dashboard" className={item(active("/dashboard"))}>
          <LayoutList className="h-5 w-5" />
          Quotes
        </Link>
        <Link to="/activities" className={item(active("/activities"))}>
          <CalendarCheck className="h-5 w-5" />
          Activities
        </Link>
        <Link to="/new-quote" className={item(active("/new-quote"))}>
          <span className="-mt-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Plus className="h-6 w-6" />
          </span>
          <span className="-mt-1">New quote</span>
        </Link>
        <Link to="/customers" className={item(active("/customers"))}>
          <Users className="h-5 w-5" />
          Customers
        </Link>
        <Link to="/settings" className={item(active("/settings"))}>
          <Settings className="h-5 w-5" />
          Settings
        </Link>
      </div>
    </nav>
  );
}

// Phone: top title bar + bottom tabs. Tablet (md): top nav. Desktop (lg): fixed left sidebar and
// full-width content, so tables and multi-pane screens can use the whole screen.
export function PageShell({
  title,
  actions,
  bar,
  wide,
  back,
  children,
}: {
  title: string;
  back?: string; // shows a back arrow: previous page, or this path when opened directly
  actions?: React.ReactNode; // right side of the title bar (all sizes)
  bar?: React.ReactNode; // sticky action bar above the mobile tab bar
  wide?: boolean; // use the full desktop width (tables, multi-pane)
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const active = useActive();
  const { isAdmin } = useMe();
  const links = LINKS.filter(
    (l) => isAdmin || (l.to !== "/products" && l.to !== "/price-extractor"),
  );
  const navLink = (to: string, on: boolean) =>
    cn(
      "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
      on
        ? "bg-secondary text-primary"
        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
    );
  return (
    <div className="min-h-screen bg-background">
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-[4.5rem] flex-col items-center gap-0.5 border-r border-border bg-card py-2 lg:flex">
        <p className="pb-1.5 text-xs font-bold leading-tight">
          Tarko<span className="block text-center text-primary">CRM</span>
        </p>
        <Link
          to="/new-quote"
          title="New quote"
          className="mb-1.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"
        >
          <Plus className="h-5 w-5" />
        </Link>
        {links.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            className={cn(
              "flex w-14 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10.5px] font-medium",
              active(to)
                ? "bg-secondary text-primary"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </Link>
        ))}
      </aside>

      <div className="lg:pl-[4.5rem] print:!pl-0">
        <header className="no-print sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
          <div
            className={cn(
              "mx-auto flex w-full max-w-md items-center justify-between gap-4 px-4 py-3 md:max-w-5xl lg:py-1.5",
              wide && "lg:max-w-none lg:px-5",
            )}
          >
            <div className="flex min-w-0 items-center gap-1">
              {back && (
                <button
                  type="button"
                  aria-label="Back"
                  title="Back"
                  onClick={() =>
                    window.history.length > 1 ? window.history.back() : navigate({ to: back })
                  }
                  className="-ml-2 rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <ArrowLeft className="h-5 w-5 lg:h-4 lg:w-4" />
                </button>
              )}
              <h1 className="truncate text-lg font-bold text-foreground lg:text-base">{title}</h1>
            </div>
            <button
              type="button"
              aria-label="Search"
              onClick={openSearch}
              className="ml-auto rounded-full p-2 text-muted-foreground hover:bg-secondary lg:hidden"
            >
              <Search className="h-5 w-5" />
            </button>
            <nav className="hidden items-center gap-1 md:flex lg:hidden">
              {links.map(({ to, label, Icon }) => (
                <Link key={to} to={to} className={navLink(to, active(to))}>
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
            {actions && <div className="flex items-center gap-2 md:hidden lg:flex">{actions}</div>}
          </div>
        </header>
        <main
          className={cn(
            "mx-auto w-full max-w-md px-4 pt-4 md:max-w-5xl md:pb-10",
            bar ? "pb-44" : "pb-28",
            wide && "lg:max-w-none lg:px-5 lg:pb-6 lg:pt-3",
          )}
        >
          {children}
        </main>
      </div>
      {bar && (
        <div className="no-print fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-card/95 backdrop-blur md:hidden">
          <div className="mx-auto max-w-md px-4 py-2">{bar}</div>
        </div>
      )}
      <BottomNav />
      <CommandPalette />
    </div>
  );
}
