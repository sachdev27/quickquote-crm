import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ActivityPanel } from "@/components/activity-panel";
import { Field, inputCls } from "@/components/qq";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import {
  deleteEnquiry,
  listBrands,
  listCustomers,
  listEnquiries,
  saveEnquiry,
  setEnquiryStatus,
} from "@/data/api";

type Enquiry = Awaited<ReturnType<typeof listEnquiries>>[number];
const plusDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// Create or edit an enquiry (a deal before there is a quote). Edit mode adds history + "Create quote".
export function EnquiryDialog({
  open,
  onOpenChange,
  enquiry,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  enquiry?: Enquiry | null;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const brands = useQuery({
    queryKey: ["brands"],
    queryFn: () => listBrands(),
    staleTime: 5 * 60_000,
  });
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => listCustomers(),
    staleTime: 60_000,
  });
  const blank = {
    title: "",
    need: "",
    value: "",
    brandId: "",
    customerId: "",
    newName: "",
    newPhone: "",
    followUp: plusDays(1),
  };
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const e = enquiry?.e;
    setF(
      e
        ? {
            title: e.title,
            need: e.need ?? "",
            value: e.expected_value ? String(e.expected_value) : "",
            brandId: e.brand_id ?? "",
            customerId: e.customer_id ?? "",
            newName: "",
            newPhone: "",
            followUp: "",
          }
        : { ...blank, brandId: brands.data?.[0]?.id ?? "" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when (re)opened
  }, [open, enquiry]);

  async function save() {
    if (!f.title.trim())
      return void toast.error("Give the enquiry a title, e.g. 110 mm PN6 for Nagpur farm");
    setSaving(true);
    try {
      await saveEnquiry({
        data: {
          ...(enquiry ? { id: enquiry.e.id } : {}),
          title: f.title,
          need: f.need,
          expected_value: Number(f.value) || 0,
          brand_id: f.brandId || null,
          customer_id: f.customerId || null,
          newCustomer:
            !f.customerId && f.newName.trim() ? { name: f.newName, phone: f.newPhone } : null,
          followUp: enquiry ? null : f.followUp || null,
        },
      });
      qc.invalidateQueries({ queryKey: ["enquiries"] });
      qc.invalidateQueries({ queryKey: ["followups"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success(enquiry ? "Enquiry saved" : "Enquiry added to the pipeline");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }
  async function markLost() {
    if (!enquiry) return;
    await setEnquiryStatus({
      data: { id: enquiry.e.id, status: enquiry.e.status === "lost" ? "open" : "lost" },
    });
    qc.invalidateQueries({ queryKey: ["enquiries"] });
    onOpenChange(false);
  }
  async function remove() {
    if (!enquiry || !confirm(`Delete enquiry "${enquiry.e.title}" and its history?`)) return;
    await deleteEnquiry({ data: { id: enquiry.e.id } });
    qc.invalidateQueries({ queryKey: ["enquiries"] });
    onOpenChange(false);
  }

  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF({ ...f, [k]: e.target.value });
  const converted = enquiry?.e.status === "converted";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{enquiry ? "Enquiry" : "New enquiry"}</DrawerTitle>
        </DrawerHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-3">
              <Field label="Title">
                <input
                  value={f.title}
                  onChange={set("title")}
                  placeholder="e.g. 110 mm PN 6, 2 km for farm line"
                  className={inputCls}
                />
              </Field>
              <Field label="Customer">
                <select value={f.customerId} onChange={set("customerId")} className={inputCls}>
                  <option value="">New / walk-in customer</option>
                  {customers.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              {!f.customerId && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={f.newName}
                    onChange={set("newName")}
                    placeholder="New customer name"
                    className={inputCls}
                  />
                  <input
                    value={f.newPhone}
                    onChange={set("newPhone")}
                    inputMode="tel"
                    placeholder="Phone"
                    className={inputCls}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Brand">
                  <select value={f.brandId} onChange={set("brandId")} className={inputCls}>
                    {brands.data?.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Expected value ₹">
                  <input
                    value={f.value}
                    onChange={set("value")}
                    inputMode="decimal"
                    placeholder="0"
                    className={inputCls}
                  />
                </Field>
              </div>
              <Field label="What they need (sizes, PN, quantity, site)">
                <textarea
                  value={f.need}
                  onChange={set("need")}
                  rows={3}
                  className={`${inputCls} h-auto py-2`}
                />
              </Field>
              {!enquiry && (
                <Field label="Follow up on">
                  <input
                    type="date"
                    value={f.followUp}
                    onChange={set("followUp")}
                    className={inputCls}
                  />
                </Field>
              )}
            </div>
            {enquiry && (
              <ActivityPanel target={{ enquiryId: enquiry.e.id }} phone={enquiry.phone ?? null} />
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {enquiry && (
            <>
              <Button
                variant="ghost"
                className="h-11 rounded-xl"
                onClick={remove}
                aria-label="Delete enquiry"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              {!converted && (
                <Button variant="outline" className="h-11 rounded-xl" onClick={markLost}>
                  {enquiry.e.status === "lost" ? "Reopen" : "Mark lost"}
                </Button>
              )}
              {!converted && (
                <Button
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={() => {
                    onOpenChange(false);
                    navigate({ to: "/new-quote", search: { enquiry: enquiry.e.id } });
                  }}
                >
                  <FileText className="mr-1 h-4 w-4" /> Create quote
                </Button>
              )}
            </>
          )}
          <Button
            className="h-11 flex-1 rounded-xl font-semibold"
            disabled={saving || converted}
            onClick={save}
          >
            {converted
              ? "Converted to a quote"
              : saving
                ? "Saving…"
                : enquiry
                  ? "Save enquiry"
                  : "Add enquiry"}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
