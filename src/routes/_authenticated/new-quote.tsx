import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, MessageCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/bottom-nav";
import { Card, Chips, Field, Stepper, inputCls } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/sheet";
import { Switch } from "@/components/ui/switch";
import {
  createQuote,
  getQuote,
  updateQuote,
  listBrands,
  listCustomers,
  listPricing,
  listProducts,
  listTerms,
  listEnquiries,
  saveProduct,
} from "@/data/api";
import { LAST_BRAND, LAST_PRESET, newPipe, normalizePn, shortName } from "@/lib/catalog";
import {
  CATEGORY_LABELS,
  buildWhatsAppUrl,
  GST_OPTIONS,
  UNIT_LABELS,
  computeTotals,
  costPerKg,
  fmtMoney,
  fmtNum,
  lineGross,
  lineWeight,
  ratePerKg,
  withBrandRaw,
  type Category,
  type Line,
  type Rate,
  type Unit,
} from "@/lib/quote";
import { recall, remember } from "@/lib/utils";
import { parseRoll, withRolls } from "@/lib/rolls";
import { useIsDesktop } from "@/hooks/use-mobile";
import { pipeKgPerM, pnNumber, sdrFor } from "@/lib/weights";

export const Route = createFileRoute("/_authenticated/new-quote")({
  validateSearch: (s: Record<string, unknown>): { enquiry?: string; edit?: string } => ({
    ...(typeof s["enquiry"] === "string" ? { enquiry: s["enquiry"] } : {}),
    ...(typeof s["edit"] === "string" ? { edit: s["edit"] } : {}),
  }),
  head: () => ({ meta: [{ title: "New quote — Tarko CRM" }] }),
  component: NewQuote,
});

type Product = Awaited<ReturnType<typeof listProducts>>[number];
// rateEdited: a hand-typed ₹/kg on the line wins over the quote's rate card.
// rollLen: metres per roll (pipes in metres only); the roll layout is also written into the description.
// fromSaved: loaded from a saved quote, so its ₹/kg is frozen but not an edit made now.
type Draft = Line & { key: string; rateEdited: boolean; rollLen?: number; fromSaved?: boolean };
type RateForm = {
  raw: string;
  rawNonIsi: string; // blank = no separate non-ISI price
  production: string;
  transport: string;
  margin: string;
  pct: boolean;
};

const num = (s: string) => (s === "" || isNaN(+s) ? 0 : +s);
const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const formRate = (f: RateForm | undefined, nonIsi = false) =>
  f
    ? ratePerKg(
        {
          raw_kg: num(f.raw),
          raw_kg_non_isi: f.rawNonIsi.trim() === "" ? null : num(f.rawNonIsi),
          production_kg: num(f.production),
          transport_kg: num(f.transport),
          margin: num(f.margin),
          margin_is_pct: f.pct ? 1 : 0,
        },
        nonIsi,
      )
    : 0;
const toForm = (c: Rate): RateForm => ({
  raw: String(c.raw_kg),
  rawNonIsi: c.raw_kg_non_isi != null ? String(c.raw_kg_non_isi) : "",
  production: String(c.production_kg),
  transport: String(c.transport_kg),
  margin: String(c.margin),
  pct: !!c.margin_is_pct,
});

function NewQuote() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const brands = useQuery({
    queryKey: ["brands"],
    queryFn: () => listBrands(),
    staleTime: 5 * 60_000,
  });
  const pricing = useQuery({
    queryKey: ["pricing"],
    queryFn: () => listPricing(),
    staleTime: 60_000,
  });
  const prods = useQuery({
    queryKey: ["products"],
    queryFn: () => listProducts(),
    staleTime: 60_000,
  });
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => listCustomers(),
    staleTime: 60_000,
  });
  const { edit: editId } = Route.useSearch();
  // Editing a saved quote: load it into the builder once everything it needs is available.
  const editing = useQuery({
    queryKey: ["quote", editId],
    queryFn: () => getQuote({ data: { id: editId ?? "" } }),
    enabled: !!editId,
  });
  const [editLoaded, setEditLoaded] = useState(false);

  const [brandId, setBrandId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [nc, setNc] = useState({ name: "", phone: "", gstin: "" });
  const [presetId, setPresetId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [nonIsi, setNonIsi] = useState(false);
  const [rates, setRates] = useState<Record<string, RateForm>>({});
  const [groupPreset, setGroupPreset] = useState<Record<string, string>>({}); // per-grade override of the quote preset
  const [openCard, setOpenCard] = useState("");
  const [igst, setIgst] = useState(false);
  const [extra, setExtra] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Draft[]>([]);
  const [sheet, setSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const desktop = useIsDesktop();
  const [ratesOpen, setRatesOpen] = useState(false);
  const termsQ = useQuery({ queryKey: ["terms"], queryFn: () => listTerms(), staleTime: 60_000 });
  const [termSel, setTermSel] = useState<Set<string>>(new Set());
  const [termsSeeded, setTermsSeeded] = useState(false);
  const [extraTerms, setExtraTerms] = useState<string[]>([]);
  const [termDraft, setTermDraft] = useState("");
  // Default terms start ticked once the library loads.
  useEffect(() => {
    if (termsQ.data && !termsSeeded) {
      setTermSel(new Set(termsQ.data.filter((t) => t.default_on).map((t) => t.id)));
      setTermsSeeded(true);
    }
  }, [termsQ.data, termsSeeded]);
  const selectedTerms = [
    ...(termsQ.data ?? []).filter((t) => termSel.has(t.id)).map((t) => t.text),
    ...extraTerms,
  ];

  useEffect(() => {
    if (brands.data?.length && !brandId)
      setBrandId(
        brands.data.find((b) => b.id === recall(LAST_BRAND))?.id ?? brands.data[0]?.id ?? "",
      );
  }, [brands.data, brandId]);
  useEffect(() => {
    const ps = pricing.data?.presets;
    if (ps?.length && !presetId)
      setPresetId(ps.find((p) => p.id === recall(LAST_PRESET))?.id ?? ps[0]!.id);
  }, [pricing.data, presetId]);
  useEffect(() => {
    if (pricing.data && !profileId) setProfileId(pricing.data.activeProfileId);
  }, [pricing.data, profileId]);
  // Picking a profile/preset loads its saved ₹/kg values; edits here only affect this quote.
  useEffect(() => {
    if (!pricing.data || !presetId || !profileId) return;
    setGroupPreset({});
    setRates(
      Object.fromEntries(
        pricing.data.rates
          .filter((r) => r.profile_id === profileId && r.preset_id === presetId)
          .map((r) => [r.group_id, toForm(withBrandRaw(r, brandRawFor(r.group_id)))]),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- brandRawFor derives from these deps
  }, [pricing.data, presetId, profileId, brandId]);
  // The brand's own raw price (per grade, per profile), if set.
  function brandRawFor(group: string) {
    return pricing.data?.brandRaw.find(
      (b) => b.profile_id === profileId && b.brand_id === brandId && b.group_id === group,
    );
  }
  const rateRow = (pid: string, group: string) =>
    pricing.data?.rates.find(
      (x) => x.profile_id === profileId && x.preset_id === pid && x.group_id === group,
    );
  const pickGroupPreset = (group: string, pid: string) => {
    const r = rateRow(pid, group);
    setGroupPreset({ ...groupPreset, [group]: pid });
    if (r) setRates({ ...rates, [group]: toForm(withBrandRaw(r, brandRawFor(group))) });
    else toast.error("That preset has no rate for this grade yet");
  };
  const presetName = (id: string) => pricing.data?.presets.find((p) => p.id === id)?.name ?? "";

  const rateOf = (id: string | null) => (id ? formRate(rates[id], nonIsi) : 0);
  // Lines priced with a separate non-ISI raw price are labelled so the quote never implies an ISI mark.
  const isNonIsiLine = (l: Line) =>
    nonIsi && !!l.rateGroupId && (rates[l.rateGroupId]?.rawNonIsi.trim() ?? "") !== "";
  const priced: Draft[] = lines.map((l) => {
    const rateKg = l.rateEdited || !l.rateGroupId ? l.rateKg : rateOf(l.rateGroupId);
    return { ...l, rateKg, unitPrice: l.weightKg > 0 ? l.weightKg * rateKg : l.unitPrice };
  });
  const totals = computeTotals(priced, num(extra), { inclusive: false, igst });
  // Roll length (m) of a pipe line: what the user set, else read from the description, else the product's.
  const rollLenOf = (l: Draft): number => {
    if (l.rollLen != null) return l.rollLen;
    const parsed = parseRoll(l.description);
    if (parsed) return parsed.len;
    const lens = (prods.data?.find((x) => x.id === l.productId)?.roll_lengths ?? "")
      .split("/")
      .map(Number)
      .filter(Boolean);
    return lens.find((x) => l.qty >= x && l.qty % x === 0) ?? lens[0] ?? 0;
  };
  const isRollPipe = (l: Line) => l.category === "pipe" && l.unit === "m";
  // Keeps "· N rolls × L m" in the description in step with qty and roll length.
  const normRoll = (l: Draft, len = rollLenOf(l)): Draft =>
    isRollPipe(l) ? { ...l, rollLen: len, description: withRolls(l.description, l.qty, len) } : l;
  const patch = (key: string, p: Partial<Draft>) =>
    setLines((l) =>
      l.map((x) => {
        if (x.key !== key) return x;
        const next = { ...x, ...p };
        return "qty" in p || "rollLen" in p ? normRoll(next, p.rollLen) : next;
      }),
    );
  // Changing the roll length keeps the number of rolls and recomputes the total metres.
  const setRollLen = (l: Draft, len: number) => {
    const old = rollLenOf(l);
    const rolls = old > 0 ? l.qty / old : 0;
    patch(
      l.key,
      rolls > 0 && len > 0 ? { rollLen: len, qty: +(rolls * len).toFixed(3) } : { rollLen: len },
    );
  };
  const setRolls = (l: Draft, rolls: number) => {
    const len = rollLenOf(l);
    if (len > 0) patch(l.key, { qty: +(rolls * len).toFixed(3) });
  };
  const usedGroups = uniq(lines.map((l) => l.rateGroupId).filter(Boolean));
  const shownGroups = (pricing.data?.groups ?? []).filter(
    (g) => !usedGroups.length || usedGroups.includes(g.id),
  );

  async function save(share = false) {
    const brand = brands.data?.find((b) => b.id === brandId);
    if (!brand) return void toast.error("Add a brand first");
    if (!lines.length) return void toast.error("Add at least one item");
    if (priced.some((l) => l.unitPrice <= 0))
      return void toast.error("Some items have no price. Check weight and ₹/kg.");
    // Open the WhatsApp tab now (inside the click) so popup blockers allow it; fill it once saved.
    const tab = share ? window.open("", "_blank") : null;
    setSaving(true);
    try {
      const out = priced.map(
        ({ key: _k, rateEdited: _r, rateGroupId: _g, rollLen: _rl, fromSaved: _fs, ...l }) => ({
          ...l,
          description: isNonIsiLine({ ...l, rateGroupId: _g })
            ? `${l.description} · Non-ISI`
            : l.description,
        }),
      );
      const body = {
        brandId: brand.id,
        customerId: customerId || null,
        presetId: presetId || null,
        profileId: profileId || null,
        nonIsi,
        newCustomer: !customerId && nc.name.trim() ? nc : null,
        igst,
        extra: num(extra),
        notes,
        terms: selectedTerms,
        lines: out,
      };
      let id: string;
      let quoteNo: string;
      if (editId) {
        const r = await updateQuote({ data: { id: editId, ...body } });
        id = editId;
        quoteNo = editing.data?.quote.quote_no ?? "";
        toast.success(r.changed ? "Quote updated" : "No changes to save");
        qc.invalidateQueries({ queryKey: ["quote", editId] });
        qc.invalidateQueries({ queryKey: ["audit", editId] });
      } else {
        ({ id, quoteNo } = await createQuote({
          data: { ...body, enquiryId: fromEnquiry?.e.id ?? null },
        }));
      }
      if (tab) {
        const cust = customers.data?.find((c) => c.id === customerId);
        tab.location.href = buildWhatsAppUrl({
          quoteNo,
          quoteDate: editing.data?.quote.quote_date ?? new Date().toISOString().slice(0, 10),
          customerName: cust?.name ?? (nc.name.trim() || null),
          customerPhone: cust?.phone ?? (nc.phone.trim() || null),
          companyName: [brand.name, brand.tagline, brand.phone].filter(Boolean).join(" · "),
          lines: out.map((l) => ({ ...l, rateGroupId: null })),
          totals,
          notes: [notes, ...selectedTerms].filter(Boolean).join("\n") || null,
        });
      }
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["enquiries"] });
      navigate({ to: "/quotes/$id", params: { id } });
    } catch (e) {
      tab?.close();
      toast.error(e instanceof Error ? e.message : "Could not save quote");
      setSaving(false);
    }
  }

  // Keyboard: "/" jumps to quick add, Ctrl/Cmd+S saves.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        quickRef.current?.focus();
      } else if (e.key.toLowerCase() === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const saveBtn = (
    <Button
      onClick={() => save()}
      disabled={saving || !lines.length}
      className="h-12 rounded-xl px-6 text-base font-semibold"
    >
      {saving ? "Saving…" : editId ? "Save changes" : "Save quote"}
    </Button>
  );
  const shareBtn = (
    <Button
      variant="outline"
      onClick={() => save(true)}
      disabled={saving || !lines.length}
      className="h-12 rounded-xl px-4 font-semibold"
      title="Save and send on WhatsApp"
    >
      <MessageCircle className="h-5 w-5 lg:mr-1" />
      <span className="hidden lg:inline">Save & WhatsApp</span>
    </Button>
  );

  const addLine = (l: Line, quiet = false) => {
    setLines((x) => [...x, normRoll({ ...l, key: crypto.randomUUID(), rateEdited: false })]);
    if (!quiet) toast.success("Added", { duration: 1000 });
  };
  // Desktop catalog click: add the product, or bump its qty by one roll / step if it's already on the quote.
  const addFromCatalog = (p: Product) => {
    const step =
      (p.roll_lengths ?? "").split("/").map(Number).find(Boolean) ?? (p.unit === "m" ? 100 : 10);
    const existing = lines.find((l) => l.productId === p.id);
    if (existing) return patch(existing.key, { qty: existing.qty + (rollLenOf(existing) || step) });
    addLine(
      {
        productId: p.id,
        rateGroupId: p.rate_group_id,
        category: p.category as Category,
        description: p.name,
        hsn: p.hsn,
        unit: p.unit as Unit,
        qty: step,
        weightKg: p.weight_kg,
        rateKg: rateOf(p.rate_group_id),
        unitPrice: p.weight_kg * rateOf(p.rate_group_id),
        gstRate: p.gst_rate,
      },
      true,
    );
  };
  const removeLine = (key: string) => setLines((x) => x.filter((l) => l.key !== key));
  const qtyIn = (l: Draft, cls = inputCls) => (
    <input
      aria-label="Quantity"
      inputMode="decimal"
      value={l.qty}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => patch(l.key, { qty: num(e.target.value) })}
      className={cls}
    />
  );
  const gstIn = (l: Draft, cls = inputCls) => (
    <select
      aria-label="GST rate"
      value={l.gstRate}
      onChange={(e) => patch(l.key, { gstRate: Number(e.target.value) })}
      className={cls}
    >
      {uniq([...GST_OPTIONS, l.gstRate])
        .sort((a, b) => a - b)
        .map((g) => (
          <option key={g} value={g}>
            {g}%
          </option>
        ))}
    </select>
  );
  const rollCell =
    "h-7 rounded-md border border-input bg-background px-1.5 text-right text-xs tabular-nums outline-none focus:border-primary focus:ring-1 focus:ring-primary/20";
  const priceIn = (l: Draft, cls = inputCls) =>
    l.weightKg > 0 ? (
      <input
        aria-label="Rate per kg"
        inputMode="decimal"
        value={+l.rateKg.toFixed(2) || ""}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) =>
          patch(l.key, { rateKg: num(e.target.value), rateEdited: true, fromSaved: false })
        }
        className={cls}
      />
    ) : (
      <input
        aria-label="Unit price"
        inputMode="decimal"
        value={l.unitPrice || ""}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => patch(l.key, { unitPrice: num(e.target.value) })}
        className={cls}
      />
    );
  const rollsShown = (l: Draft) => {
    const len = rollLenOf(l);
    return len > 0 ? +(l.qty / len).toFixed(2) || "" : "";
  };
  const cell =
    "h-9 w-full rounded-lg border border-input bg-background px-2 text-right text-sm tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  // Quick add with live suggestions. Order: brand OD PN PE roll/cut, e.g. "tarko 63 6 pe63 roll x2".
  // Every part is optional and can be partial; "x2" = 2 rolls (or pieces), "300m" = metres.
  const quickRef = useRef<HTMLInputElement>(null);
  const [quick, setQuick] = useState("");
  const [qi, setQi] = useState(0);
  const suggestions = useMemo(() => {
    const toks = quick.toLowerCase().split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    const qtyTok = toks.find((t) => /^x\d+(\.\d+)?$/.test(t) || /^\d+(\.\d+)?m$/.test(t));
    const rest = toks.filter((t) => t !== qtyTok);
    const brand = brands.data?.find((b) =>
      rest.some((t) => b.name.toLowerCase().replace(/\s/g, "").startsWith(t) && t.length >= 2),
    );
    const words = rest.filter(
      (t) => !(brand && brand.name.toLowerCase().replace(/\s/g, "").startsWith(t)),
    );
    const nums = words.filter((t) => /^\d+(\.\d+)?$/.test(t));
    const grade = words.find((t) => /^pe\d*$/.test(t));
    const roll = words.find((t) => /^(cut|c)$/.test(t) || ("cut".startsWith(t) && t.length > 1))
      ? "cut"
      : words.find((t) => "roll".startsWith(t) || "complete".startsWith(t))
        ? "complete"
        : null;
    const text = words.filter(
      (t) => !nums.includes(t) && t !== grade && !/^(cut|roll|r|c|complete)$/.test(t),
    );
    const out = (prods.data ?? []).filter((p) => {
      if (p.category === "pipe") {
        if (nums[0] && !String(p.size_mm ?? "").startsWith(nums[0])) return false;
        if (nums[1] && !String(pnNumber(p.pn)).startsWith(nums[1])) return false;
        if (grade && !(p.grade ?? "").toLowerCase().startsWith(grade)) return false;
        if (roll && (p.roll ?? "complete") !== roll) return false;
        return text.every((t) => p.name.toLowerCase().includes(t));
      }
      if (nums.length > 1 || grade || roll) return false;
      return text.length > 0 && text.every((t) => p.name.toLowerCase().includes(t));
    });
    // exact size match first, then catalog order
    out.sort(
      (x, y) => Number(String(y.size_mm) === nums[0]) - Number(String(x.size_mm) === nums[0]),
    );
    const qty = (p: Product) => {
      const len = (p.roll_lengths ?? "").split("/").map(Number).find(Boolean);
      if (qtyTok?.endsWith("m")) return Number(qtyTok.slice(0, -1));
      const n = qtyTok ? Number(qtyTok.slice(1)) : p.category === "pipe" ? 1 : Number(nums[0]) || 1;
      return p.unit === "m" ? n * (len ?? 100) : n;
    };
    return out.slice(0, 8).map((p) => ({ p, brand, qty: qty(p) }));
  }, [quick, prods.data, brands.data]);

  function quickAdd(i = qi) {
    const s = suggestions[i];
    if (!s) return void toast.error("No matching product. Try: tarko 63 6 pe63 roll x2");
    if (s.brand && s.brand.id !== brandId) {
      setBrandId(s.brand.id);
      remember(LAST_BRAND, s.brand.id);
      if (lines.length)
        toast.message(
          `Quote brand changed to ${s.brand.name}; all lines now price with ${s.brand.name}'s raw material.`,
        );
    }
    addFromCatalogQty(s.p, s.qty);
    setQuick("");
    setQi(0);
  }
  const suggestLabel = (p: Product) =>
    p.category === "pipe"
      ? `${p.size_mm} mm${p.inch ? ` (${p.inch})` : ""} · PN ${pnNumber(p.pn) || p.pn} · ${p.grade} · ${p.roll === "cut" ? "Cut roll" : "Roll"}`
      : p.name;
  function addFromCatalogQty(p: Product, qty: number) {
    const existing = lines.find((l) => l.productId === p.id);
    if (existing) return patch(existing.key, { qty: existing.qty + qty });
    addLine(
      {
        productId: p.id,
        rateGroupId: p.rate_group_id,
        category: p.category as Category,
        description: p.name,
        hsn: p.hsn,
        unit: p.unit as Unit,
        qty,
        weightKg: p.weight_kg,
        rateKg: rateOf(p.rate_group_id),
        unitPrice: p.weight_kg * rateOf(p.rate_group_id),
        gstRate: p.gst_rate,
      },
      true,
    );
  }

  // Customer: type to search; anything not matching becomes a new customer (phone/GSTIN fields appear).
  const custLabel = (c: { name: string; phone: string | null }) =>
    `${c.name}${c.phone ? ` · ${c.phone}` : ""}`;
  const [custText, setCustText] = useState("");
  const onCustomer = (v: string) => {
    setCustText(v);
    const hit = customers.data?.find((c) => custLabel(c) === v);
    setCustomerId(hit?.id ?? "");
    setNc({ ...nc, name: hit ? "" : v });
  };

  // Started from an enquiry: pre-fill customer, brand and notes once data is in.
  const { enquiry: enquiryId } = Route.useSearch();
  const enqs = useQuery({
    queryKey: ["enquiries"],
    queryFn: () => listEnquiries(),
    enabled: !!enquiryId,
    staleTime: 30_000,
  });
  const fromEnquiry = enqs.data?.find((x) => x.e.id === enquiryId);
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (!fromEnquiry || prefilled || !customers.data || !brands.data) return;
    const c = customers.data.find((x) => x.id === fromEnquiry.e.customer_id);
    if (c) {
      setCustText(custLabel(c));
      setCustomerId(c.id);
    }
    if (fromEnquiry.e.brand_id) setBrandId(fromEnquiry.e.brand_id);
    if (fromEnquiry.e.need) setNotes(`Enquiry: ${fromEnquiry.e.title}\n${fromEnquiry.e.need}`);
    setPrefilled(true);
    toast.message(`Quoting enquiry: ${fromEnquiry.e.title}`);
  }, [fromEnquiry, customers.data, brands.data, prefilled]);

  useEffect(() => {
    const d = editing.data;
    if (!d || editLoaded || !customers.data || !brands.data || !termsQ.data || !prods.data) return;
    const { quote: q, customer, lines: saved } = d;
    setBrandId(q.brand_id);
    if (q.preset_id) setPresetId(q.preset_id);
    if (q.profile_id) setProfileId(q.profile_id);
    setNonIsi(!!q.non_isi);
    setIgst(!!q.igst);
    setExtra(q.extra_charges ? String(q.extra_charges) : "");
    setNotes(q.notes ?? "");
    if (customer) {
      setCustomerId(customer.id);
      setCustText(custLabel(customer));
    }
    const wanted = (q.terms ?? "")
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    setTermSel(new Set(termsQ.data.filter((t) => wanted.includes(t.text)).map((t) => t.id)));
    setExtraTerms(wanted.filter((t) => !termsQ.data.some((x) => x.text === t)));
    setTermsSeeded(true);
    // Saved prices stay as they were (rateEdited); the "· Non-ISI" tag is re-added on save.
    setLines(
      saved.map((l) => ({
        ...l,
        description: l.description.replace(/\s*·\s*Non-ISI$/i, ""),
        rateGroupId: prods.data.find((p) => p.id === l.productId)?.rate_group_id ?? null,
        key: crypto.randomUUID(),
        rateEdited: true,
        fromSaved: true,
      })),
    );
    setEditLoaded(true);
  }, [editing.data, editLoaded, customers.data, brands.data, termsQ.data, prods.data]);

  const selectCls =
    "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
  const ratesSummary = shownGroups
    .map((g) => `${g.name.replace("HDPE ", "")} ${fmtMoney(formRate(rates[g.id], nonIsi))}`)
    .join(" · ");

  return (
    <PageShell
      title={editId ? `Edit ${editing.data?.quote.quote_no ?? "quote"}` : "New quote"}
      wide
      bar={
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {lines.length} items · {fmtNum(priced.reduce((s, l) => s + lineWeight(l), 0))} kg
            </p>
            <p className="text-xl font-bold tabular-nums leading-tight">{fmtMoney(totals.total)}</p>
          </div>
          <div className="flex gap-2">
            {shareBtn}
            {saveBtn}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* command bar: who, which brand, which price basis — one row on desktop */}
        <div className="grid gap-2 rounded-2xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))]">
          <div className="sm:col-span-2 lg:col-span-1">
            <input
              list="customer-list"
              aria-label="Customer"
              placeholder="Customer: type name or phone (blank = walk-in)"
              value={custText}
              onChange={(e) => onCustomer(e.target.value)}
              className={`${inputCls} h-11`}
            />
            <datalist id="customer-list">
              {customers.data?.map((c) => (
                <option key={c.id} value={custLabel(c)} />
              ))}
            </datalist>
            {custText && !customerId && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  placeholder="Phone (new customer)"
                  inputMode="tel"
                  value={nc.phone}
                  onChange={(e) => setNc({ ...nc, phone: e.target.value })}
                  className={`${inputCls} h-10`}
                />
                <input
                  placeholder="GSTIN (optional)"
                  value={nc.gstin}
                  onChange={(e) => setNc({ ...nc, gstin: e.target.value.toUpperCase() })}
                  className={`${inputCls} h-10`}
                />
              </div>
            )}
          </div>
          <select
            aria-label="Brand"
            value={brandId}
            className={selectCls}
            onChange={(e) => {
              const id = e.target.value;
              setBrandId(id);
              remember(LAST_BRAND, id);
              const pid = brands.data?.find((b) => b.id === id)?.default_preset_id;
              if (pid && pricing.data?.presets.some((p) => p.id === pid)) setPresetId(pid);
            }}
          >
            {brands.data?.map((b) => (
              <option key={b.id} value={b.id}>
                Brand: {b.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Preset"
            value={presetId}
            className={selectCls}
            onChange={(e) => {
              setPresetId(e.target.value);
              remember(LAST_PRESET, e.target.value);
            }}
          >
            {pricing.data?.presets.map((p) => (
              <option key={p.id} value={p.id}>
                Preset: {p.name}
              </option>
            ))}
          </select>
          <select
            aria-label="ISI marking"
            value={nonIsi ? "non" : "isi"}
            className={`${selectCls} ${nonIsi ? "border-amber-400 text-amber-800" : ""}`}
            onChange={(e) => setNonIsi(e.target.value === "non")}
          >
            <option value="isi">ISI marked</option>
            <option value="non">Non-ISI</option>
          </select>
          <select
            aria-label="Profile"
            value={profileId}
            className={selectCls}
            onChange={(e) => setProfileId(e.target.value)}
          >
            {pricing.data?.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.id === pricing.data!.activeProfileId ? " ●" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
          <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <CatalogPanel
              products={prods.data ?? []}
              rateOf={rateOf}
              onPick={addFromCatalog}
              onMore={() => setSheet(true)}
              inQuote={new Set(lines.map((l) => l.productId ?? ""))}
            />
          </aside>

          <div className="space-y-4">
            <Card title={`Items · ${lines.length}`}>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    ref={quickRef}
                    aria-label="Quick add"
                    role="combobox"
                    aria-expanded={suggestions.length > 0}
                    aria-controls="quick-suggestions"
                    autoComplete="off"
                    value={quick}
                    onChange={(e) => {
                      setQuick(e.target.value);
                      setQi(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setQi((i) => Math.min(i + 1, suggestions.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setQi((i) => Math.max(i - 1, 0));
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        quickAdd();
                      } else if (e.key === "Escape") setQuick("");
                    }}
                    placeholder="Quick add: brand OD PN PE roll/cut, qty: tarko 63 6 pe63 roll x2 · 90 8 300m · sprinkler x10   ( / )"
                    className={`${inputCls} h-11 text-sm`}
                  />
                  {suggestions.length > 0 && (
                    <ul
                      id="quick-suggestions"
                      role="listbox"
                      className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
                    >
                      {suggestions.map((s, i) => (
                        <li key={s.p.id} role="option" aria-selected={i === qi}>
                          <button
                            type="button"
                            onMouseEnter={() => setQi(i)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              quickAdd(i);
                            }}
                            className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${i === qi ? "bg-primary/10" : ""}`}
                          >
                            <span className="min-w-0 truncate">
                              <b>{(s.brand ?? brands.data?.find((b) => b.id === brandId))?.name}</b>{" "}
                              {suggestLabel(s.p)}
                            </span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {fmtNum(s.qty)} {UNIT_LABELS[s.p.unit as Unit]} ·{" "}
                              <b className="text-foreground">
                                ₹{fmtNum(s.p.weight_kg * rateOf(s.p.rate_group_id))}/
                                {UNIT_LABELS[s.p.unit as Unit]}
                              </b>
                            </span>
                          </button>
                        </li>
                      ))}
                      <li className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                        ↑ ↓ to choose · Enter to add · x2 = 2 rolls · 300m = metres
                      </li>
                    </ul>
                  )}
                </div>
                <Button
                  variant="outline"
                  className="h-11 shrink-0 rounded-xl"
                  onClick={() => quickAdd()}
                >
                  Add
                </Button>
              </div>
              {/* phone / tablet cards */}
              <div className="space-y-3 lg:hidden">
                {priced.map((l) => (
                  <div key={l.key} className="rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                          {CATEGORY_LABELS[l.category]} · GST {l.gstRate}%
                          {isNonIsiLine(l) ? " · Non-ISI" : ""}
                        </p>
                        <p className="font-semibold leading-snug">{l.description}</p>
                      </div>
                      <button
                        type="button"
                        aria-label="Remove item"
                        className="-m-2 p-2 text-muted-foreground"
                        onClick={() => removeLine(l.key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {isRollPipe(l) && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <Field label="Roll length (m)">
                          <input
                            aria-label="Roll length (m)"
                            inputMode="decimal"
                            placeholder="m"
                            value={rollLenOf(l) || ""}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => setRollLen(l, num(e.target.value))}
                            className={inputCls}
                          />
                        </Field>
                        <Field label="Rolls">
                          <input
                            aria-label="Number of rolls"
                            inputMode="decimal"
                            value={rollsShown(l)}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => setRolls(l, num(e.target.value))}
                            className={inputCls}
                          />
                        </Field>
                        <Field label="Total (m)">{qtyIn(l)}</Field>
                      </div>
                    )}
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {!isRollPipe(l) && (
                        <Field label={`Qty (${UNIT_LABELS[l.unit]})`}>{qtyIn(l)}</Field>
                      )}
                      <Field
                        label={
                          l.weightKg > 0
                            ? `₹/kg${l.rateEdited && !l.fromSaved ? " (edited)" : ""}`
                            : `₹/${UNIT_LABELS[l.unit]}`
                        }
                      >
                        {priceIn(l)}
                      </Field>
                      <Field label="GST">{gstIn(l)}</Field>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between text-sm tabular-nums">
                      <span className="text-muted-foreground">
                        {l.weightKg > 0
                          ? `${fmtNum(l.weightKg, 3)} kg/${UNIT_LABELS[l.unit]} → ${fmtMoney(l.unitPrice)}/${UNIT_LABELS[l.unit]} · ${fmtNum(lineWeight(l))} kg`
                          : `${fmtMoney(l.unitPrice)}/${UNIT_LABELS[l.unit]}`}
                      </span>
                      <span className="font-semibold">{fmtMoney(lineGross(l))}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* desktop spreadsheet */}
              <div className="hidden lg:block">
                {lines.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Click a price in the catalog on the left to add it. Click again to add another
                    roll.
                  </p>
                ) : (
                  <table className="w-full tabular-nums">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-2 font-semibold">Item</th>
                        <th className="w-24 px-1 text-right font-semibold">Qty</th>
                        <th className="w-20 px-1 text-right font-semibold">Kg</th>
                        <th className="w-24 px-1 text-right font-semibold">₹/kg</th>
                        <th className="w-24 px-1 text-right font-semibold">₹/unit</th>
                        <th className="w-20 px-1 text-right font-semibold">GST</th>
                        <th className="w-28 px-1 text-right font-semibold">Amount</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {priced.map((l) => (
                        <tr key={l.key} className="border-b border-border/60 align-middle">
                          <td className="py-1.5 pr-2">
                            <p className="text-sm font-medium leading-tight">{l.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {[
                                CATEGORY_LABELS[l.category],
                                isNonIsiLine(l) && "Non-ISI",
                                l.rateEdited && !l.fromSaved && "₹/kg edited",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                            {isRollPipe(l) && (
                              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                <span>Roll</span>
                                <input
                                  aria-label="Roll length (m)"
                                  inputMode="decimal"
                                  placeholder="m"
                                  value={rollLenOf(l) || ""}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) => setRollLen(l, num(e.target.value))}
                                  className={`${rollCell} w-14`}
                                />
                                <span>m ×</span>
                                <input
                                  aria-label="Number of rolls"
                                  inputMode="decimal"
                                  value={rollsShown(l)}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) => setRolls(l, num(e.target.value))}
                                  className={`${rollCell} w-12`}
                                />
                                <span>rolls</span>
                              </div>
                            )}
                          </td>
                          <td className="px-1">
                            <div className="flex items-center gap-1">
                              {qtyIn(l, cell)}
                              <span className="w-7 text-xs text-muted-foreground">
                                {UNIT_LABELS[l.unit]}
                              </span>
                            </div>
                          </td>
                          <td className="px-1 text-right text-sm">
                            {l.weightKg > 0 ? fmtNum(lineWeight(l)) : "—"}
                          </td>
                          <td className="px-1">
                            {l.weightKg > 0 ? (
                              priceIn(l, cell)
                            ) : (
                              <span className="block text-right text-sm text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-1 text-right text-sm">
                            {l.weightKg > 0 ? fmtNum(l.unitPrice) : priceIn(l, cell)}
                          </td>
                          <td className="px-1">{gstIn(l, cell)}</td>
                          <td className="px-1 text-right text-sm font-semibold">
                            {fmtMoney(lineGross(l))}
                          </td>
                          <td className="pl-1 text-right">
                            <button
                              type="button"
                              aria-label="Remove item"
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                              onClick={() => removeLine(l.key)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {desktop && (
                <AddItemSheet
                  inline
                  open={sheet}
                  onOpenChange={setSheet}
                  products={prods.data ?? []}
                  groups={pricing.data?.groups ?? []}
                  rateOf={rateOf}
                  onAdd={(l) => addLine(l)}
                />
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheet(desktop ? !sheet : true)}
                className="h-12 w-full rounded-xl border-dashed text-base lg:h-10 lg:text-sm"
              >
                <Plus className="mr-1 h-5 w-5" /> <span className="lg:hidden">Add item</span>
                <span className="hidden lg:inline">
                  {sheet ? "Close custom item" : "Custom item, new size or custom length"}
                </span>
              </Button>
            </Card>

            <Card>
              <button
                type="button"
                onClick={() => setRatesOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={ratesOpen}
              >
                <span className="min-w-0">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Rates ₹/kg{nonIsi ? " · Non-ISI" : ""}
                  </span>
                  <span className="block truncate text-sm font-semibold tabular-nums">
                    {ratesSummary || "—"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                  {ratesOpen ? "Hide" : "Adjust"}{" "}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${ratesOpen ? "rotate-180" : ""}`}
                  />
                </span>
              </button>
              {ratesOpen && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Raw + production + transport + margin. Tap a grade to pick another preset for it
                    or adjust values for this quote only.
                  </p>
                  <ul className="-my-1 divide-y divide-border/60 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:divide-y-0">
                    {shownGroups.map((c) => {
                      const f = rates[c.id];
                      const open = openCard === c.id;
                      const set = (k: keyof RateForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
                        f && setRates({ ...rates, [c.id]: { ...f, [k]: e.target.value } });
                      return (
                        <li
                          key={c.id}
                          className={`border-border/60 py-1 lg:border-b ${open ? "lg:col-span-2" : ""}`}
                        >
                          <button
                            type="button"
                            onClick={() => setOpenCard(open ? "" : c.id)}
                            className="flex w-full items-center justify-between py-2 text-left"
                            aria-expanded={open}
                          >
                            <span className="min-w-0">
                              <span className="block font-medium">{c.name}</span>
                              {groupPreset[c.id] && groupPreset[c.id] !== presetId && (
                                <span className="block text-xs font-semibold text-primary">
                                  {presetName(groupPreset[c.id]!)} preset
                                </span>
                              )}
                            </span>
                            <span className="flex items-center gap-2 text-lg font-bold tabular-nums">
                              {fmtMoney(formRate(f, nonIsi))}
                              <span className="text-xs font-medium text-muted-foreground">/kg</span>
                              <ChevronDown
                                className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                              />
                            </span>
                          </button>
                          {open && f && (
                            <div className="space-y-2 pb-2">
                              {pricing.data && pricing.data.presets.length > 1 && (
                                <Chips
                                  label={`Preset for ${c.name}`}
                                  value={groupPreset[c.id] ?? presetId}
                                  onChange={(pid) => pickGroupPreset(c.id, pid)}
                                  options={pricing.data.presets.map((p) => {
                                    const r = rateRow(p.id, c.id);
                                    return {
                                      value: p.id,
                                      label: p.name,
                                      sub: r
                                        ? `₹${fmtNum(ratePerKg(withBrandRaw(r, brandRawFor(c.id)), nonIsi))}/kg`
                                        : "not set",
                                    };
                                  })}
                                />
                              )}
                              <div className="grid grid-cols-2 gap-2">
                                <Field label="Raw material ₹/kg">
                                  <input
                                    inputMode="decimal"
                                    value={f.raw}
                                    onFocus={(e) => e.currentTarget.select()}
                                    onChange={set("raw")}
                                    className={inputCls}
                                  />
                                </Field>
                                <Field label="Non-ISI raw ₹/kg">
                                  <input
                                    inputMode="decimal"
                                    value={f.rawNonIsi}
                                    placeholder="same as ISI"
                                    onFocus={(e) => e.currentTarget.select()}
                                    onChange={set("rawNonIsi")}
                                    className={inputCls}
                                  />
                                </Field>
                                <Field label="Production ₹/kg">
                                  <input
                                    inputMode="decimal"
                                    value={f.production}
                                    onFocus={(e) => e.currentTarget.select()}
                                    onChange={set("production")}
                                    className={inputCls}
                                  />
                                </Field>
                                <Field label="Transport ₹/kg">
                                  <input
                                    inputMode="decimal"
                                    value={f.transport}
                                    onFocus={(e) => e.currentTarget.select()}
                                    onChange={set("transport")}
                                    className={inputCls}
                                  />
                                </Field>
                                <Field label={`Margin ${f.pct ? "%" : "₹/kg"}`}>
                                  <input
                                    inputMode="decimal"
                                    value={f.margin}
                                    onFocus={(e) => e.currentTarget.select()}
                                    onChange={set("margin")}
                                    className={inputCls}
                                  />
                                </Field>
                              </div>
                              <p className="text-xs text-muted-foreground tabular-nums">
                                Cost{" "}
                                {fmtMoney(
                                  costPerKg({
                                    raw_kg: num(f.raw),
                                    production_kg: num(f.production),
                                    transport_kg: num(f.transport),
                                  }),
                                )}
                                /kg + margin ={" "}
                                <span className="font-semibold text-foreground">
                                  {fmtMoney(formRate(f, nonIsi))}/kg{nonIsi ? " (Non-ISI)" : ""}
                                </span>
                              </p>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </Card>

            <Card title={`Terms & conditions · ${selectedTerms.length}`}>
              <ul className="space-y-1.5">
                {(termsQ.data ?? []).map((t) => (
                  <li key={t.id}>
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                        checked={termSel.has(t.id)}
                        onChange={() => {
                          const n = new Set(termSel);
                          if (n.has(t.id)) n.delete(t.id);
                          else n.add(t.id);
                          setTermSel(n);
                        }}
                      />
                      <span>{t.text}</span>
                    </label>
                  </li>
                ))}
                {extraTerms.map((t, i) => (
                  <li key={t} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked
                      readOnly
                      className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                    />
                    <span className="flex-1">
                      {t} <span className="text-xs text-muted-foreground">(this quote only)</span>
                    </span>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => setExtraTerms(extraTerms.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <input
                placeholder="Add a term for this quote only, press Enter"
                value={termDraft}
                onChange={(e) => setTermDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && termDraft.trim()) {
                    setExtraTerms([...extraTerms, termDraft.trim()]);
                    setTermDraft("");
                  }
                }}
                className={`${inputCls} h-10 text-sm`}
              />
              <textarea
                className="w-full rounded-xl border border-input bg-background p-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                rows={2}
                placeholder="Notes (delivery address, contact, remarks…)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Card>

            <Card title="Tax & charges" className="lg:hidden">
              <label className="flex items-center justify-between">
                <span className="text-sm font-medium">Inter-state supply (IGST)</span>
                <Switch checked={igst} onCheckedChange={setIgst} />
              </label>
              <Field label="Forwarding / extra charges ₹">
                <input
                  inputMode="decimal"
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <TotalsBlock totals={totals} igst={igst} />
            </Card>

            {/* desktop: one compact sticky bar */}
            <div className="hidden lg:sticky lg:bottom-4 lg:block">
              <Card className="shadow-lg">
                <div className="flex items-center justify-between gap-6 tabular-nums">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                    <label className="flex items-center gap-2 font-medium text-foreground">
                      IGST <Switch checked={igst} onCheckedChange={setIgst} />
                    </label>
                    <label className="flex items-center gap-2">
                      Freight ₹
                      <input
                        inputMode="decimal"
                        value={extra}
                        onChange={(e) => setExtra(e.target.value)}
                        placeholder="0"
                        className="h-9 w-24 rounded-lg border border-input bg-background px-2 text-right text-sm text-foreground outline-none focus:border-primary"
                      />
                    </label>
                    <span>
                      {lines.length} items · {fmtNum(priced.reduce((s, l) => s + lineWeight(l), 0))}{" "}
                      kg
                    </span>
                    <span>
                      Taxable <b className="text-foreground">{fmtMoney(totals.taxable)}</b>
                    </span>
                    {igst ? (
                      <span>
                        IGST <b className="text-foreground">{fmtMoney(totals.igst)}</b>
                      </span>
                    ) : (
                      <span>
                        CGST + SGST{" "}
                        <b className="text-foreground">{fmtMoney(totals.cgst + totals.sgst)}</b>
                      </span>
                    )}
                    {totals.roundOff !== 0 && <span>Round off {fmtMoney(totals.roundOff)}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold">{fmtMoney(totals.total)}</span>
                    {shareBtn}
                    {saveBtn}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {!desktop && (
        <AddItemSheet
          open={sheet}
          onOpenChange={setSheet}
          products={prods.data ?? []}
          groups={pricing.data?.groups ?? []}
          rateOf={rateOf}
          onAdd={(l) => addLine(l)}
        />
      )}
    </PageShell>
  );
}

// Desktop-only catalog: grade tabs, then a size × PN grid of ₹/m like the printed price list.
function CatalogPanel({
  products,
  rateOf,
  onPick,
  onMore,
  inQuote,
}: {
  products: Product[];
  rateOf: (id: string | null) => number;
  onPick: (p: Product) => void;
  onMore: () => void;
  inQuote: Set<string>;
}) {
  const [cat, setCat] = useState<Category>("pipe");
  const [grade, setGrade] = useState("");
  const [roll, setRoll] = useState("complete");
  const pipes = products.filter((p) => p.category === "pipe");
  const grades = uniq(pipes.map((p) => p.grade ?? ""));
  const g = grades.includes(grade) ? grade : (grades[0] ?? "");
  const rolls = uniq(pipes.filter((p) => p.grade === g).map((p) => p.roll ?? "complete"));
  const r = rolls.includes(roll) ? roll : (rolls[0] ?? "complete");
  const rows = pipes.filter((p) => p.grade === g && (p.roll ?? "complete") === r);
  const sizes = uniq(rows.map((p) => p.size_mm ?? 0)).sort((a, b) => a - b);
  const pns = uniq(rows.map((p) => p.pn ?? "")).sort((a, b) => pnNumber(a) - pnNumber(b));
  const others = products.filter((p) => p.category === cat);
  const unitPrice = (p: Product) => p.weight_kg * rateOf(p.rate_group_id);

  return (
    <Card title="Catalog · click to add">
      <Chips<Category>
        label="Category"
        value={cat}
        onChange={setCat}
        options={(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => ({
          value: c,
          label: CATEGORY_LABELS[c],
        }))}
      />
      {cat === "pipe" ? (
        <>
          <Chips
            label="Grade"
            value={g}
            onChange={setGrade}
            options={grades.map((x) => ({
              value: x,
              label: x,
              sub: `₹${fmtNum(rateOf(pipes.find((p) => p.grade === x)?.rate_group_id ?? x))}/kg`,
            }))}
          />
          {rolls.length > 1 && (
            <Chips
              label="Supply"
              value={r}
              onChange={setRoll}
              options={rolls.map((x) => ({ value: x, label: x === "cut" ? "Cut roll" : "Roll" }))}
            />
          )}
          <table className="w-full tabular-nums">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="py-1 text-left font-semibold">mm</th>
                {pns.map((pn) => (
                  <th key={pn} className="py-1 text-right font-semibold">
                    {pn}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sizes.map((size) => (
                <tr key={size} className="border-t border-border/60">
                  <td className="py-1 pr-1 text-sm font-semibold">
                    {size}
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      {rows.find((p) => p.size_mm === size)?.inch}
                    </span>
                  </td>
                  {pns.map((pn) => {
                    const p = rows.find((x) => x.size_mm === size && x.pn === pn);
                    return (
                      <td key={pn} className="p-0.5 text-right">
                        {p ? (
                          <button
                            type="button"
                            onClick={() => onPick(p)}
                            title={`${p.name} · ${fmtNum(p.weight_kg, 3)} kg/m`}
                            className={`w-full rounded-md px-1.5 py-1.5 text-right text-sm font-semibold transition-colors hover:bg-primary hover:text-primary-foreground ${inQuote.has(p.id) ? "bg-primary/10 text-primary" : ""}`}
                          >
                            {fmtNum(unitPrice(p))}
                          </button>
                        ) : (
                          <span className="block px-1.5 text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-muted-foreground">
            ₹ per metre, ex-GST. Click adds one roll (
            {r === "cut" ? "100 m for cut roll" : "first roll length"}).
          </p>
        </>
      ) : (
        <ul className="-my-1 divide-y divide-border/60">
          {others.length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">
              Nothing here yet. Add under Products.
            </li>
          )}
          {others.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-1 py-2 text-left hover:bg-secondary ${inQuote.has(p.id) ? "text-primary" : ""}`}
              >
                <span className="min-w-0 truncate text-sm font-medium">{p.name}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  ₹{fmtNum(unitPrice(p))}/{UNIT_LABELS[p.unit as Unit]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" className="h-9 w-full rounded-lg text-sm" onClick={onMore}>
        Custom item, new size or custom length…
      </Button>
    </Card>
  );
}

function TotalsBlock({
  totals,
  igst,
}: {
  totals: ReturnType<typeof computeTotals>;
  igst: boolean;
}) {
  const row = (k: string, v: number) => (
    <div className="flex justify-between text-sm text-muted-foreground">
      <span>{k}</span>
      <span className="tabular-nums text-foreground">{fmtMoney(v)}</span>
    </div>
  );
  return (
    <div className="space-y-1.5">
      {row("Taxable value", totals.taxable)}
      {igst ? (
        row("IGST", totals.igst)
      ) : (
        <>
          {row("CGST", totals.cgst)}
          {row("SGST", totals.sgst)}
        </>
      )}
      {totals.roundOff !== 0 && row("Round off", totals.roundOff)}
      <div className="flex items-baseline justify-between border-t border-border pt-2">
        <span className="font-semibold">Total incl. GST</span>
        <span className="text-2xl font-bold tabular-nums">{fmtMoney(totals.total)}</span>
      </div>
    </div>
  );
}

// Bottom sheet; stays open after "Add" so a whole enquiry can be keyed in without reopening.
// Every chip row is derived from the product catalog, so adding a product adds its grade/size/PN/length.
function AddItemSheet({
  open,
  onOpenChange,
  products,
  groups,
  rateOf,
  onAdd,
  inline,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  products: Product[];
  groups: { id: string; name: string }[];
  rateOf: (id: string | null) => number;
  onAdd: (l: Line) => void;
  inline?: boolean; // desktop: render inside the items card instead of a sheet
}) {
  const [cat, setCat] = useState<Category | "custom">("pipe");
  const pipes = useMemo(() => products.filter((p) => p.category === "pipe"), [products]);
  const [grade, setGrade] = useState("");
  const [roll, setRoll] = useState("");
  const [size, setSize] = useState(0);
  const [pn, setPn] = useState("");
  const [rollLen, setRollLen] = useState(-1); // -1 = first roll length, 0 = custom metres
  const [rolls, setRolls] = useState(1);
  const [metres, setMetres] = useState("100");
  const [pickId, setPickId] = useState("");
  const [pcs, setPcs] = useState(10);
  const [cu, setCu] = useState({
    cat: "fitting" as Category,
    name: "",
    hsn: "3917 40 00",
    unit: "pc" as Unit,
    gst: 18,
    weight: "",
    card: "FITTING",
    price: "",
    qty: "1",
    save: true,
  });
  // "+ New" size / PN: saved straight into the catalog so it's there next time.
  const [np, setNp] = useState<null | {
    size: string;
    inch: string;
    pn: string;
    lens: string;
    weight: string;
  }>(null);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["products"] });

  // Each level only offers what exists below it; stale picks fall back to the first valid option.
  const grades = uniq(pipes.map((p) => p.grade ?? ""));
  const g = grades.includes(grade) ? grade : (grades[0] ?? "");
  const rollsOpt = uniq(pipes.filter((p) => p.grade === g).map((p) => p.roll ?? "complete"));
  const r = rollsOpt.includes(roll) ? roll : (rollsOpt[0] ?? "");
  const sizes = uniq(
    pipes.filter((p) => p.grade === g && (p.roll ?? "complete") === r).map((p) => p.size_mm ?? 0),
  ).sort((a, b) => a - b);
  const s = sizes.includes(size) ? size : (sizes[0] ?? 0);
  const pnOpts = pipes.filter(
    (p) => p.grade === g && (p.roll ?? "complete") === r && p.size_mm === s,
  );
  const pipe = pnOpts.find((p) => p.pn === pn) ?? pnOpts[0];
  const lens = (pipe?.roll_lengths ?? "").split("/").map(Number).filter(Boolean);
  // rollLen 0 = "Custom" metres; otherwise a roll length that exists for this pipe (falls back to the first).
  const customLen = !lens.length || rollLen === 0;
  const len = lens.includes(rollLen) ? rollLen : (lens[0] ?? 0);

  const groupFor = (grade: string) =>
    groups.find((x) => x.id === grade)?.id ??
    pipes.find((p) => p.grade === grade)?.rate_group_id ??
    groups[0]?.id ??
    "";
  const isKg = (size: string, pnLabel: string) => {
    const sdr = sdrFor(g, pnNumber(pnLabel));
    return sdr && num(size) ? pipeKgPerM(num(size), sdr).toFixed(3) : "";
  };
  const openNewPipe = (from: "size" | "pn") =>
    setNp({
      size: from === "pn" ? String(s) : "",
      inch: from === "pn" ? (pipe?.inch ?? "") : "",
      pn: from === "size" ? (pipe?.pn ?? "PN 6") : "",
      lens: pipe?.roll_lengths ?? "",
      weight: from === "size" ? "" : "",
    });

  async function saveNewPipe() {
    if (!np) return;
    const size = Math.round(num(np.size));
    const pnLabel = normalizePn(np.pn);
    const weight = num(np.weight) || num(isKg(np.size, pnLabel));
    if (!size || !pnLabel || weight <= 0) return void toast.error("Enter size, PN and weight");
    if (
      pipes.some(
        (p) =>
          p.grade === g && (p.roll ?? "complete") === r && p.size_mm === size && p.pn === pnLabel,
      )
    )
      return void toast.error("That size and PN already exist");
    try {
      await saveProduct({
        data: newPipe({
          grade: g,
          roll: r,
          size,
          inch: np.inch,
          pn: pnLabel,
          lens: np.lens,
          weight,
          groupId: groupFor(g),
        }),
      });
      await refresh();
      setSize(size);
      setPn(pnLabel);
      setNp(null);
      toast.success("Saved to products");
    } catch (e) {
      toast.error(e instanceof Error ? e.message.slice(0, 140) : "Could not save");
    }
  }

  async function saveRollLength() {
    const m = Math.round(num(metres));
    if (!pipe || m <= 0 || lens.includes(m)) return;
    const next = [...lens, m].sort((a, b) => a - b).join("/");
    // every PN of this size/grade shares the roll lengths
    await Promise.all(
      pnOpts.map((p) =>
        saveProduct({
          data: {
            id: p.id,
            category: "pipe",
            rate_group_id: p.rate_group_id,
            name: p.name,
            grade: p.grade,
            roll: p.roll,
            pn: p.pn,
            inch: p.inch,
            roll_lengths: next,
            hsn: p.hsn,
            size_mm: p.size_mm,
            unit: p.unit as Unit,
            weight_kg: p.weight_kg,
            gst_rate: p.gst_rate,
            active: true,
          },
        }),
      ),
    );
    await refresh();
    setRollLen(m);
    toast.success(`${m} m saved as a roll length`);
  }

  const listItems = products.filter((p) => p.category === cat);
  const picked = listItems.find((p) => p.id === pickId) ?? listItems[0];
  const sel = cat === "pipe" ? pipe : cat === "custom" ? undefined : picked;

  const unitPriceOf = (p?: Product) => (p ? p.weight_kg * rateOf(p.rate_group_id) : 0);
  const cuRate = cu.weight ? rateOf(cu.card) : 0;
  const unitPrice = sel
    ? unitPriceOf(sel)
    : num(cu.weight) > 0
      ? num(cu.weight) * cuRate
      : num(cu.price);
  const qty =
    cat === "pipe" ? (customLen ? num(metres) : rolls * len) : cat === "custom" ? num(cu.qty) : pcs;
  const unit = (sel?.unit ?? cu.unit) as Unit;

  async function add() {
    if (cat === "custom") {
      if (!cu.name.trim() || unitPrice <= 0 || qty <= 0)
        return void toast.error("Enter name, quantity and weight or price");
      const w = num(cu.weight);
      let productId: string | null = null;
      if (cu.save && w > 0) {
        try {
          ({ id: productId } = await saveProduct({
            data: {
              category: cu.cat,
              rate_group_id: cu.card,
              name: cu.name.trim(),
              grade: null,
              roll: null,
              pn: null,
              inch: null,
              roll_lengths: null,
              hsn: cu.hsn || null,
              size_mm: null,
              unit: cu.unit,
              weight_kg: w,
              gst_rate: cu.gst,
              active: true,
            },
          }));
          await refresh();
        } catch (e) {
          return void toast.error(
            e instanceof Error ? e.message.slice(0, 140) : "Could not save product",
          );
        }
      }
      onAdd({
        productId,
        rateGroupId: w > 0 ? cu.card : null,
        category: cu.cat,
        description: cu.name.trim(),
        hsn: cu.hsn || null,
        unit: cu.unit,
        qty,
        weightKg: w,
        rateKg: w > 0 ? cuRate : 0,
        unitPrice,
        gstRate: cu.gst,
      });
      setCu({ ...cu, name: "", weight: "", price: "" });
      return;
    }
    if (!sel) return void toast.error("Pick a product");
    if (qty <= 0) return void toast.error("Enter a quantity");
    if (sel.weight_kg <= 0)
      return void toast.error("This product has no weight. Set it under Products.");
    const desc =
      cat === "pipe" && !customLen
        ? `${sel.name} · ${rolls} roll${rolls > 1 ? "s" : ""} × ${len} m`
        : sel.name;
    onAdd({
      productId: sel.id,
      rateGroupId: sel.rate_group_id,
      category: sel.category as Category,
      description: desc,
      hsn: sel.hsn,
      unit: sel.unit as Unit,
      qty,
      weightKg: sel.weight_kg,
      rateKg: rateOf(sel.rate_group_id),
      unitPrice,
      gstRate: sel.gst_rate,
    });
  }

  const perUnit = (p?: Product) =>
    p ? `₹${fmtNum(unitPriceOf(p))}/${UNIT_LABELS[p.unit as Unit]}` : "";

  const body = (
    <>
      <div className={inline ? "space-y-4" : "space-y-4 overflow-y-auto px-4 pb-2"}>
        <Chips<Category | "custom">
          label="Category"
          value={cat}
          onChange={setCat}
          options={[
            ...(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => ({
              value: c,
              label: CATEGORY_LABELS[c],
            })),
            { value: "custom" as const, label: "Custom" },
          ]}
        />

        {cat === "pipe" && (
          <>
            {!pipes.length && (
              <p className="text-sm text-muted-foreground">
                No pipes yet. Add them under Products.
              </p>
            )}
            {grades.length > 1 && (
              <Field label="Grade">
                <Chips
                  label="Grade"
                  value={g}
                  onChange={setGrade}
                  options={grades.map((x) => ({
                    value: x,
                    label: x,
                    sub: `₹${fmtNum(rateOf(x))}/kg`,
                  }))}
                />
              </Field>
            )}
            {rollsOpt.length > 1 && (
              <Field label="Supply">
                <Chips
                  label="Supply"
                  value={r}
                  onChange={setRoll}
                  options={rollsOpt.map((x) => ({
                    value: x,
                    label: x === "cut" ? "Cut roll" : "Complete roll",
                  }))}
                />
              </Field>
            )}
            <Field label="Size (mm)">
              <Chips
                label="Size"
                value={np && !np.size ? -1 : s}
                onChange={(x) => (x === -1 ? openNewPipe("size") : (setSize(x), setNp(null)))}
                options={[
                  ...sizes.map((x) => ({
                    value: x,
                    label: `${x}`,
                    sub: pipes.find((p) => p.size_mm === x)?.inch ?? "mm",
                  })),
                  { value: -1, label: "+ New", sub: "size" },
                ]}
              />
            </Field>
            <Field label="Pressure class">
              <Chips
                label="Pressure class"
                value={np && np.size ? "__new" : (pipe?.pn ?? "")}
                onChange={(x) => (x === "__new" ? openNewPipe("pn") : (setPn(x), setNp(null)))}
                options={[
                  ...pnOpts.map((p) => ({
                    value: p.pn ?? "",
                    label: p.pn ?? "—",
                    sub: perUnit(p),
                  })),
                  { value: "__new", label: "+ New", sub: "PN" },
                ]}
              />
            </Field>
            {np && (
              <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
                <p className="text-sm font-semibold">
                  New {g} {r === "cut" ? "cut roll" : "pipe"} · saved to products
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Size (mm)">
                    <input
                      inputMode="numeric"
                      value={np.size}
                      onChange={(e) => setNp({ ...np, size: e.target.value, weight: "" })}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Inch (optional)">
                    <input
                      value={np.inch}
                      onChange={(e) => setNp({ ...np, inch: e.target.value })}
                      placeholder='5"'
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Pressure class">
                    <input
                      value={np.pn}
                      onChange={(e) => setNp({ ...np, pn: e.target.value, weight: "" })}
                      placeholder="PN 6"
                      className={inputCls}
                    />
                  </Field>
                  <Field label={`kg/m (IS 4984 ${isKg(np.size, np.pn) || "—"})`}>
                    <input
                      inputMode="decimal"
                      value={np.weight}
                      placeholder={isKg(np.size, np.pn)}
                      onChange={(e) => setNp({ ...np, weight: e.target.value })}
                      className={inputCls}
                    />
                  </Field>
                  {r !== "cut" && (
                    <div className="col-span-2">
                      <Field label="Roll lengths (m)">
                        <input
                          value={np.lens}
                          onChange={(e) => setNp({ ...np, lens: e.target.value })}
                          placeholder="100/200"
                          className={inputCls}
                        />
                      </Field>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" className="h-11 rounded-xl" onClick={() => setNp(null)}>
                    Cancel
                  </Button>
                  <Button className="h-11 flex-1 rounded-xl font-semibold" onClick={saveNewPipe}>
                    Save {g} {np.size || "?"} mm {np.pn || ""}
                  </Button>
                </div>
              </div>
            )}
            <Field label="Length">
              <Chips
                label="Roll length"
                value={customLen ? 0 : len}
                onChange={setRollLen}
                options={[
                  ...lens.map((x) => ({ value: x, label: `${x} m`, sub: "roll" })),
                  { value: 0, label: "Custom", sub: "metres" },
                ]}
              />
            </Field>
            {customLen ? (
              <Field label="Metres">
                <div className="flex gap-2">
                  <input
                    inputMode="decimal"
                    value={metres}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setMetres(e.target.value)}
                    className={inputCls}
                  />
                  {pipe &&
                    r !== "cut" &&
                    num(metres) > 0 &&
                    !lens.includes(Math.round(num(metres))) && (
                      <Button
                        variant="outline"
                        className="h-12 shrink-0 rounded-xl"
                        onClick={saveRollLength}
                      >
                        Save as roll
                      </Button>
                    )}
                </div>
              </Field>
            ) : (
              <Field label="Rolls">
                <Stepper label="Rolls" value={rolls} onChange={setRolls} />
              </Field>
            )}
          </>
        )}

        {(cat === "sprinkler" || cat === "fitting") && (
          <>
            {!listItems.length && (
              <p className="text-sm text-muted-foreground">
                No {CATEGORY_LABELS[cat].toLowerCase()} products yet. Add them under Products, or
                use Custom.
              </p>
            )}
            <div className="space-y-2" role="radiogroup" aria-label="Product">
              {listItems.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={picked?.id === p.id}
                  onClick={() => setPickId(p.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left ${picked?.id === p.id ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{shortName(p)}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {fmtNum(p.weight_kg, 3)} kg × ₹{fmtNum(rateOf(p.rate_group_id))}/kg
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{perUnit(p)}</span>
                </button>
              ))}
            </div>
            {!!listItems.length && (
              <Field label={`Quantity (${UNIT_LABELS[(picked?.unit ?? "pc") as Unit]})`}>
                <Stepper label="Quantity" value={pcs} onChange={setPcs} />
              </Field>
            )}
          </>
        )}

        {cat === "custom" && (
          <div className="space-y-3">
            <Chips
              label="Custom category"
              value={cu.cat}
              onChange={(c) =>
                setCu({
                  ...cu,
                  cat: c,
                  gst: c === "sprinkler" ? 5 : 18,
                  card: c === "sprinkler" ? "SPRINKLER" : cu.card,
                })
              }
              options={[
                { value: "fitting" as Category, label: "Fitting" },
                { value: "sprinkler" as Category, label: "Sprinkler" },
                { value: "pipe" as Category, label: "Pipe / other" },
              ]}
            />
            <Field label="Item name">
              <input
                value={cu.name}
                onChange={(e) => setCu({ ...cu, name: e.target.value })}
                placeholder="e.g. 110 mm Elbow 90°"
                className={inputCls}
              />
            </Field>
            <Field label="Sold per">
              <Chips<Unit>
                label="Unit"
                value={cu.unit}
                onChange={(u) => setCu({ ...cu, unit: u })}
                options={[
                  { value: "pc", label: "Piece" },
                  { value: "m", label: "Metre" },
                  { value: "kg", label: "Kg" },
                ]}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Quantity">
                <input
                  inputMode="decimal"
                  value={cu.qty}
                  onChange={(e) => setCu({ ...cu, qty: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label={`Weight kg/${UNIT_LABELS[cu.unit]} (optional)`}>
                <input
                  inputMode="decimal"
                  value={cu.weight}
                  onChange={(e) => setCu({ ...cu, weight: e.target.value })}
                  className={inputCls}
                />
              </Field>
            </div>
            {num(cu.weight) > 0 ? (
              <Field label="Rate group">
                <Chips
                  label="Rate group"
                  value={cu.card}
                  onChange={(c) => setCu({ ...cu, card: c })}
                  options={groups.map((c) => ({
                    value: c.id,
                    label: c.name,
                    sub: `₹${fmtNum(rateOf(c.id))}/kg`,
                  }))}
                />
              </Field>
            ) : (
              <Field label={`Price ₹/${UNIT_LABELS[cu.unit]} (ex-GST)`}>
                <input
                  inputMode="decimal"
                  value={cu.price}
                  onChange={(e) => setCu({ ...cu, price: e.target.value })}
                  className={inputCls}
                />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label="HSN">
                <input
                  value={cu.hsn}
                  onChange={(e) => setCu({ ...cu, hsn: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="GST">
                <select
                  className={inputCls}
                  value={cu.gst}
                  onChange={(e) => setCu({ ...cu, gst: +e.target.value })}
                >
                  {GST_OPTIONS.map((x) => (
                    <option key={x} value={x}>
                      {x}%
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {num(cu.weight) > 0 ? (
              <label className="flex items-center justify-between rounded-xl border border-border p-3">
                <span className="text-sm font-medium">Save to products for next time</span>
                <Switch checked={cu.save} onCheckedChange={(v) => setCu({ ...cu, save: v })} />
              </label>
            ) : (
              <p className="text-xs text-muted-foreground">
                Fixed-price items are used on this quote only. Enter a weight to price by formula
                and save it to products.
              </p>
            )}
          </div>
        )}
      </div>
      <div
        className={
          inline
            ? "flex items-center gap-3 border-t border-border pt-3"
            : "flex items-center gap-3 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        }
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground tabular-nums">
            {fmtNum(qty)} {UNIT_LABELS[unit]} × {fmtMoney(unitPrice)}/{UNIT_LABELS[unit]}
          </p>
          <p className="text-lg font-bold tabular-nums leading-tight">
            {fmtMoney(qty * unitPrice)}
            <span className="text-xs font-medium text-muted-foreground"> + GST</span>
          </p>
        </div>
        <Button variant="outline" className="h-12 rounded-xl" onClick={() => onOpenChange(false)}>
          Done
        </Button>
        <Button className="h-12 rounded-xl px-6 font-semibold" onClick={add}>
          Add
        </Button>
      </div>
    </>
  );

  if (inline)
    return open ? (
      <div className="space-y-4 rounded-xl border border-primary/40 bg-primary/5 p-4">
        <p className="text-sm font-semibold">Custom item, new size or custom length</p>
        {body}
      </div>
    ) : null;
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle>Add item</DrawerTitle>
        </DrawerHeader>
        {body}
      </DrawerContent>
    </Drawer>
  );
}
