import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Field, inputCls } from "@/components/qq";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { addCustomer, setQuoteCustomer, updateCustomer, type listCustomers } from "@/data/api";
import { stateOf } from "@/lib/quote-doc";

type Row = Awaited<ReturnType<typeof listCustomers>>[number];
const KEYS = [
  "name",
  "contact_person",
  "phone",
  "email",
  "gstin",
  "pan",
  "address",
  "city",
  "state",
  "pincode",
  "ship_to",
  "notes",
] as const;
type Key = (typeof KEYS)[number];
export type CustomerForm = Record<Key, string>;

const EMPTY = Object.fromEntries(KEYS.map((k) => [k, ""])) as CustomerForm;
const toForm = (c?: Partial<Row> | null): CustomerForm => ({
  ...EMPTY,
  ...(c ? Object.fromEntries(KEYS.map((k) => [k, (c[k] as string | null | undefined) ?? ""])) : {}),
});
// GSTIN starts with the 2-digit state code: "27ABCDE…" -> Maharashtra
const gstState = (g: string) => stateOf(g)?.replace(/\s*\(\d+\)$/, "") ?? "";

// Create or edit a customer with the full record. From a quotation (`quoteId`): edits are noted in
// its history, and a new customer is attached to it.
export function CustomerDialog({
  open,
  onOpenChange,
  customer,
  quoteId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customer?: Partial<Row> | null;
  quoteId?: string;
  onSaved?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState<CustomerForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  // remembered while the dialog is open so the labels don't flip during the close animation
  const [isEdit, setIsEdit] = useState(!!customer);
  useEffect(() => {
    if (open) {
      setF(toForm(customer));
      setIsEdit(!!customer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when (re)opened
  }, [open]);

  const set = (k: Key) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((cur) => {
      const v = ["gstin", "pan"].includes(k) ? e.target.value.toUpperCase() : e.target.value;
      const next = { ...cur, [k]: v };
      // fill the state from a freshly typed GSTIN while the state is empty or was auto-filled
      if (k === "gstin" && (!cur.state || cur.state === gstState(cur.gstin)))
        next.state = gstState(v) || cur.state;
      return next;
    });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return void toast.error("Name is required");
    setSaving(true);
    try {
      let id: string | null | undefined = customer?.id;
      if (id) await updateCustomer({ data: { ...f, id, ...(quoteId ? { quoteId } : {}) } });
      else if (quoteId)
        ({ id } = await setQuoteCustomer({ data: { quoteId, customerId: null, newCustomer: f } }));
      else id = (await addCustomer({ data: f })).id;
      for (const k of [["customers"], ["quotes"], ["quote", quoteId], ["audit", quoteId]])
        qc.invalidateQueries({ queryKey: k });
      toast.success(isEdit ? "Customer saved" : "Customer added");
      if (id) onSaved?.(id);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message.slice(0, 160) : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const input = (
    k: Key,
    label: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <Field label={label}>
      <input value={f[k]} onChange={set(k)} className={inputCls} {...extra} />
    </Field>
  );
  const area = (k: Key, label: string, rows = 2) => (
    <Field label={label}>
      <textarea value={f[k]} onChange={set(k)} rows={rows} className={`${inputCls} h-auto py-2`} />
    </Field>
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{isEdit ? "Edit customer" : "New customer"}</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={save} className="@container flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
            <div className="grid gap-3 @xl:grid-cols-2">
              {input("name", "Company / customer name *")}
              {input("contact_person", "Contact person")}
              {input("phone", "Phone", { inputMode: "tel" })}
              {input("email", "Email", { inputMode: "email", type: "email" })}
              {input("gstin", "GSTIN", { maxLength: 15, placeholder: "27ABCDE1234F1Z5" })}
              {input("pan", "PAN", { maxLength: 10 })}
            </div>
            {area("address", "Address (street, area)")}
            <div className="grid gap-3 @xl:grid-cols-3">
              {input("city", "City / district")}
              {input("state", "State")}
              {input("pincode", "Pincode", { inputMode: "numeric", maxLength: 6 })}
            </div>
            {area("ship_to", "Ship to (only if different from the address)")}
            {area("notes", "Notes (internal, not printed)", 2)}
          </div>
          <div className="flex gap-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="ghost"
              className="h-12 rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="h-12 flex-1 rounded-xl text-base font-semibold"
            >
              {saving
                ? "Saving…"
                : isEdit
                  ? "Save customer"
                  : quoteId
                    ? "Add to this quotation"
                    : "Save customer"}
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
