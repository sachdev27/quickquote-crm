import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutList, Users, Plus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const item = (active: boolean) =>
    cn(
      "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
      active ? "text-primary" : "text-muted-foreground hover:text-foreground"
    );

  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-md items-stretch px-2 pb-[env(safe-area-inset-bottom)]">
        <Link to="/dashboard" className={item(pathname.startsWith("/dashboard"))}>
          <LayoutList className="h-5 w-5" />
          Quotes
        </Link>
        <Link to="/customers" className={item(pathname.startsWith("/customers"))}>
          <Users className="h-5 w-5" />
          Customers
        </Link>
        <Link
          to="/new-quote"
          className={cn(item(pathname.startsWith("/new-quote")), "text-primary-foreground")}
        >
          <span className="flex h-11 w-11 -mt-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Plus className="h-6 w-6" />
          </span>
          <span className="-mt-1">New quote</span>
        </Link>
        <Link to="/settings" className={item(pathname.startsWith("/settings"))}>
          <Settings className="h-5 w-5" />
          Settings
        </Link>
      </div>
    </nav>
  );
}

export function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-foreground">{title}</h1>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-4">{children}</main>
      <BottomNav />
    </div>
  );
}
