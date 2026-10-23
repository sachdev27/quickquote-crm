import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarCheck,
  FileText,
  LayoutList,
  Plus,
  Settings,
  Tag,
  Users,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { EnquiryDialog } from "@/components/enquiry-dialog";
import { listContacts, listCustomers, listEnquiries, listProducts, listQuotes } from "@/data/api";
import { useMe } from "@/hooks/use-me";
import { fmtMoney } from "@/lib/quote";

const EVENT = "tarko:search";
export const openSearch = () => window.dispatchEvent(new Event(EVENT));

// ⌘K / Ctrl+K from anywhere: jump to any customer, contact, quote, enquiry or product, or run an action.
export function CommandPalette() {
  const navigate = useNavigate();
  const { isAdmin } = useMe();
  const [open, setOpen] = useState(false);
  const [newEnquiry, setNewEnquiry] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(EVENT, onOpen);
    };
  }, []);

  const opts = { enabled: open, staleTime: 60_000 };
  const customers = useQuery({ queryKey: ["customers"], queryFn: () => listCustomers(), ...opts });
  const contacts = useQuery({
    queryKey: ["contacts", "all"],
    queryFn: () => listContacts({ data: {} }),
    ...opts,
  });
  const quotes = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes(), ...opts });
  const enquiries = useQuery({ queryKey: ["enquiries"], queryFn: () => listEnquiries(), ...opts });
  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => listProducts(),
    ...opts,
    enabled: open && isAdmin,
  });

  const go = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  const custName = (id: string) => customers.data?.find((c) => c.id === id)?.name ?? "";

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search customers, contacts, quotes, enquiries, products…" />
        <CommandList className="max-h-[60vh]">
          <CommandEmpty>Nothing found.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => go(() => navigate({ to: "/new-quote" }))}>
              <Plus /> New quote <CommandShortcut>quote</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => go(() => setNewEnquiry(true))}>
              <Plus /> New enquiry <CommandShortcut>deal</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => go(() => navigate({ to: "/dashboard" }))}>
              <LayoutList /> Quotes & pipeline
            </CommandItem>
            <CommandItem onSelect={() => go(() => navigate({ to: "/activities" }))}>
              <CalendarCheck /> Activities & follow-ups
            </CommandItem>
            <CommandItem onSelect={() => go(() => navigate({ to: "/insights" }))}>
              <BarChart3 /> Dashboard
            </CommandItem>
            <CommandItem onSelect={() => go(() => navigate({ to: "/customers" }))}>
              <Users /> Customers
            </CommandItem>
            <CommandItem onSelect={() => go(() => navigate({ to: "/price-list" }))}>
              <FileText /> Price list
            </CommandItem>
            {isAdmin && (
              <CommandItem onSelect={() => go(() => navigate({ to: "/products" }))}>
                <Tag /> Products & pricing
              </CommandItem>
            )}
            <CommandItem onSelect={() => go(() => navigate({ to: "/settings" }))}>
              <Settings /> Settings
            </CommandItem>
          </CommandGroup>
          {!!customers.data?.length && (
            <CommandGroup heading="Customers">
              {customers.data.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`customer ${c.name} ${c.phone ?? ""} ${c.gstin ?? ""}`}
                  onSelect={() => go(() => navigate({ to: "/customers", search: { id: c.id } }))}
                >
                  <Users /> {c.name}
                  <span className="ml-auto text-xs text-muted-foreground">{c.phone}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!contacts.data?.length && (
            <CommandGroup heading="Contact people">
              {contacts.data.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`contact ${c.name} ${c.phone ?? ""} ${c.email ?? ""} ${custName(c.customer_id)}`}
                  onSelect={() =>
                    go(() => navigate({ to: "/customers", search: { id: c.customer_id } }))
                  }
                >
                  <Users /> {c.name}
                  <span className="text-xs text-muted-foreground">· {custName(c.customer_id)}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{c.phone}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!quotes.data?.length && (
            <CommandGroup heading="Quotes">
              {quotes.data.map((q) => (
                <CommandItem
                  key={q.id}
                  value={`quote ${q.quote_no} ${q.customer_name ?? ""} ${q.brand_name ?? ""}`}
                  onSelect={() => go(() => navigate({ to: "/quotes/$id", params: { id: q.id } }))}
                >
                  <FileText /> {q.quote_no}
                  <span className="text-xs text-muted-foreground">
                    · {q.customer_name ?? "Walk-in"}
                  </span>
                  <span className="ml-auto text-xs tabular-nums">{fmtMoney(q.total)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!enquiries.data?.length && (
            <CommandGroup heading="Enquiries">
              {enquiries.data.map((e) => (
                <CommandItem
                  key={e.e.id}
                  value={`enquiry ${e.e.title} ${e.customer ?? ""}`}
                  onSelect={() =>
                    go(() =>
                      navigate({ to: "/dashboard", search: { view: "pipeline", enquiry: e.e.id } }),
                    )
                  }
                >
                  <CalendarCheck /> {e.e.title}
                  <span className="text-xs text-muted-foreground">
                    · {e.customer ?? "—"} · {e.e.status}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!products.data?.length && (
            <CommandGroup heading="Products">
              {products.data.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`product ${p.name}`}
                  onSelect={() => go(() => navigate({ to: "/products" }))}
                >
                  <Tag /> {p.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
      <EnquiryDialog open={newEnquiry} onOpenChange={setNewEnquiry} />
    </>
  );
}
