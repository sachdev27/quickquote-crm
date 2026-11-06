import { useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, FileText, FileUp, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/bottom-nav";
import { GmailInbox } from "@/components/gmail-inbox";
import { Button } from "@/components/ui/button";
import { listProducts } from "@/data/api";
import { extractEnquiry } from "@/data/ai";
import { matchesSearch } from "@/lib/catalog";
import { productQueryFilter } from "@/lib/product-search";
import { MAX_FILE_BYTES, type ExtractedItem, type Extraction } from "@/lib/ai/inbound";
import { AI_DRAFT_KEY, matchItem, quoteQty, replyDraft, type AiDraft } from "@/lib/ai/match";
import { ACCEPT_EXT, classify } from "@/lib/ai/files";
import { CATEGORY_LABELS } from "@/lib/quote";
import { pnNumber } from "@/lib/weights";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ai-quote")({
  head: () => ({ meta: [{ title: "AI Quote — Tarko CRM" }] }),
  component: AiQuotePage,
});

type Product = Awaited<ReturnType<typeof listProducts>>[number];
// productId "" = no catalog product (a custom item if desc and price are filled). desc/price/gst override the catalog (blank = catalog).
type Row = { item: ExtractedItem; productId: string; desc: string; price: string; gst: string };

const toBase64 = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

const label = (p: Product) =>
  p.category === "pipe"
    ? `${p.size_mm} mm · PN ${pnNumber(p.pn) || p.pn} · ${p.grade}${p.roll === "cut" ? " · cut roll" : ""}`
    : `${p.name}${p.grade ? ` · ${p.grade}` : ""}`;

const input =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function AiQuotePage() {
  const navigate = useNavigate();
  const prods = useQuery({
    queryKey: ["products"],
    queryFn: () => listProducts(),
    staleTime: 60_000,
  });
  const products = useMemo(() => prods.data ?? [], [prods.data]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [customer, setCustomer] = useState<Extraction["customer"]>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"paste" | "gmail">("paste");
  const [from, setFrom] = useState<string | null>(null);
  const [readInfo, setReadInfo] = useState<{
    model: string;
    read: { name: string; how: string }[];
  } | null>(null);

  const applyExtraction = (extraction: Extraction) => {
    setCustomer(extraction.customer);
    setNotes(extraction.notes);
    setRows(
      extraction.items.map((item) => {
        const m = matchItem(item, products);
        return {
          item,
          productId: m.status === "matched" ? m.candidates[0]!.id : "",
          desc: "",
          price: "",
          gst: "",
        };
      }),
    );
    if (!extraction.items.length) toast.message("No product lines found in that enquiry");
  };

  const run = useMutation({
    mutationFn: async () => {
      const attachments = await Promise.all(
        files.map(async (f) => ({ name: f.name, mime: f.type, base64: await toBase64(f) })),
      );
      return extractEnquiry({ data: { source: "upload", text, attachments } });
    },
    onSuccess: ({ extraction, model, read }) => {
      setFrom(null);
      setReadInfo({ model, read });
      applyExtraction(extraction);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Extraction failed"),
  });

  const addFiles = (list: FileList | File[] | null) => {
    const ok: File[] = [];
    for (const f of Array.from(list ?? [])) {
      if (!classify(f.name, f.type))
        toast.error(`${f.name}: use PDF, image, audio, Word, Excel, CSV or text`);
      else if (f.size > MAX_FILE_BYTES)
        toast.error(`${f.name}: over ${MAX_FILE_BYTES / 1048576} MB`);
      else ok.push(f);
    }
    setFiles((x) => [...x, ...ok].slice(0, 3));
  };

  const patchRow = (i: number, p: Partial<Row> | { item: Partial<ExtractedItem> }) =>
    setRows(
      (r) =>
        r?.map((x, j) =>
          j !== i ? x : "item" in p ? { ...x, item: { ...x.item, ...p.item } } : { ...x, ...p },
        ) ?? null,
    );

  const byId = new Map(products.map((p) => [p.id, p]));
  const priceOf = (r: Row) => (r.price.trim() === "" ? undefined : Number(r.price));
  // no catalog product, but a name and a price typed: it is a custom item
  const isCustom = (r: Row) => !byId.has(r.productId) && !!r.desc.trim() && (priceOf(r) ?? 0) > 0;
  const usable = (r: Row) => byId.has(r.productId) || isCustom(r);
  const picked = (rows ?? []).filter(usable);
  const unmatched = (rows ?? []).filter((r) => !usable(r));
  const titleOf = (r: Row) => r.desc.trim() || label(byId.get(r.productId)!);
  const customerName = customer?.company || customer?.name || null;

  const reply = replyDraft({
    customer: customer?.name ?? customerName,
    lines: picked.map((r) => {
      const p = byId.get(r.productId);
      return {
        title: titleOf(r),
        qty: r.item.qty ?? 1,
        unit: r.item.unit === "rolls" ? "roll(s)" : (p?.unit ?? r.item.unit) === "m" ? "m" : "pc",
      };
    }),
    unmatched: unmatched.map((r) => r.item.raw),
  });

  const createQuote = (pdf = false) => {
    // same catalog product with no overrides: one line with the quantities added up
    const merged = new Map<string, number>();
    const lines: AiDraft["lines"] = [];
    for (const r of picked) {
      const p = byId.get(r.productId);
      const over = {
        ...(r.desc.trim() ? { description: r.desc.trim() } : {}),
        ...(priceOf(r) != null ? { unitPrice: priceOf(r)! } : {}),
        ...(r.gst.trim() !== "" ? { gstRate: Number(r.gst) } : {}),
      };
      if (!p) {
        const u = r.item.unit;
        lines.push({
          productId: null,
          qty: r.item.qty ?? 1,
          unit: u === "m" || u === "kg" ? u : "pc",
          ...over,
        });
      } else if (Object.keys(over).length) {
        lines.push({ productId: p.id, qty: quoteQty(r.item, p), ...over });
      } else merged.set(p.id, (merged.get(p.id) ?? 0) + quoteQty(r.item, p));
    }
    const draft: AiDraft = {
      customerName,
      notes: notes ? `AI enquiry: ${notes}` : null,
      lines: [...[...merged].map(([productId, qty]) => ({ productId, qty })), ...lines],
      ...(pdf ? { pdf: true } : {}),
    };
    try {
      sessionStorage.setItem(AI_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      return void toast.error("Could not hand the draft to the quote form");
    }
    void navigate({ to: "/new-quote", search: { ai: "1" } });
  };

  const busy = run.isPending;
  const canRun = (text.trim() || files.length) && !busy && !prods.isLoading;

  return (
    <PageShell title="AI Quote" wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Customer enquiry
          </h2>
          <div className="flex gap-1 rounded-lg bg-secondary p-1 text-sm">
            {(["paste", "gmail"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 font-medium",
                  tab === t ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
              >
                {t === "paste" ? "Paste / upload" : "Gmail inbox"}
              </button>
            ))}
          </div>
          {tab === "gmail" ? (
            <GmailInbox
              onExtracted={(r) => {
                setReadInfo({ model: r.model, read: r.read });
                applyExtraction(r.extraction);
                setFrom(
                  `${r.subject}${r.files.length ? ` (+${r.files.length} file${r.files.length > 1 ? "s" : ""})` : ""}`,
                );
              }}
            />
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={(e) => {
                  const imgs = Array.from(e.clipboardData.files).filter((f) =>
                    f.type.startsWith("image/"),
                  );
                  if (imgs.length) {
                    e.preventDefault();
                    addFiles(imgs);
                  }
                }}
                rows={9}
                placeholder="Paste an email, WhatsApp message or chat here (or paste a screenshot). Signatures and chatter are ignored."
                className="w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addFiles(e.dataTransfer.files);
                }}
                className="rounded-xl border border-dashed border-border p-3 text-center text-sm text-muted-foreground"
              >
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-2 font-medium text-primary"
                >
                  <FileUp className="h-4 w-4" /> Attach PDF, image, Word, Excel, audio…
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  hidden
                  accept={ACCEPT_EXT}
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <p className="mt-1 text-xs">
                  Up to 3 files, 6 MB each. You can also drop them here.
                </p>
              </div>
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-secondary px-3 py-1.5 text-sm"
                >
                  <span className="truncate">{f.name}</span>
                  <button
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button className="w-full" disabled={!canRun} onClick={() => run.mutate()}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {busy ? "Reading enquiry…" : "Extract items"}
              </Button>
              <p className="text-xs text-muted-foreground">
                The AI only reads the enquiry. Products are matched to your catalog and rates come
                from your pricing, never from the AI.
              </p>
            </>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          {!rows ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Extracted items appear here for review.
            </p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-muted-foreground">
                  Customer
                  <input
                    className={input}
                    value={customerName ?? ""}
                    onChange={(e) =>
                      setCustomer({ ...(customer ?? blank), company: e.target.value })
                    }
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Phone
                  <input
                    className={input}
                    value={customer?.phone ?? ""}
                    onChange={(e) => setCustomer({ ...(customer ?? blank), phone: e.target.value })}
                  />
                </label>
              </div>
              {from && <p className="text-xs text-muted-foreground">From email: {from}</p>}
              {readInfo && (
                <p className="text-xs text-muted-foreground">
                  AI ({readInfo.model}) read the message text
                  {readInfo.read.map((r) => `, ${r.name} (${r.how})`).join("")}. Found {rows.length}{" "}
                  line
                  {rows.length === 1 ? "" : "s"}.
                </p>
              )}
              {notes && <p className="rounded-lg bg-secondary px-3 py-2 text-xs">Notes: {notes}</p>}

              <ul className="divide-y divide-border">
                {rows.map((r, i) => {
                  const m = matchItem(r.item, products);
                  const ok = usable(r);
                  const custom = !byId.has(r.productId);
                  return (
                    <li key={i} className="space-y-2 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm">&ldquo;{r.item.raw}&rdquo;</p>
                        <button
                          aria-label="Remove line"
                          onClick={() => setRows((x) => x?.filter((_, j) => j !== i) ?? null)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </div>
                      <div className="grid grid-cols-[1fr_5rem_5rem] gap-2">
                        <ProductPicker
                          products={products}
                          candidates={m.candidates}
                          value={r.productId}
                          invalid={!ok}
                          placeholder={
                            m.status === "none"
                              ? "Search products, or fill the fields below"
                              : "Pick a product…"
                          }
                          onChange={(id) => patchRow(i, { productId: id })}
                        />
                        <input
                          aria-label="Quantity"
                          inputMode="decimal"
                          className={input}
                          value={r.item.qty ?? ""}
                          onChange={(e) =>
                            patchRow(i, {
                              item: { qty: e.target.value ? Number(e.target.value) : null },
                            })
                          }
                        />
                        <select
                          aria-label="Unit"
                          className={input}
                          value={r.item.unit ?? ""}
                          onChange={(e) =>
                            patchRow(i, {
                              item: { unit: (e.target.value || null) as ExtractedItem["unit"] },
                            })
                          }
                        >
                          <option value="">—</option>
                          <option value="m">m</option>
                          <option value="rolls">rolls</option>
                          <option value="pc">pc</option>
                          <option value="kg">kg</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-[1fr_6rem_4.5rem] gap-2">
                        <input
                          aria-label="Description on quote"
                          className={input}
                          placeholder={
                            custom ? "Item name on the quote" : "Description (blank = catalog name)"
                          }
                          value={r.desc}
                          onChange={(e) => patchRow(i, { desc: e.target.value })}
                        />
                        <input
                          aria-label="Price per unit"
                          inputMode="decimal"
                          className={input}
                          placeholder={custom ? "₹ / unit" : "₹ catalog"}
                          value={r.price}
                          onChange={(e) => patchRow(i, { price: e.target.value })}
                        />
                        <input
                          aria-label="GST percent"
                          inputMode="decimal"
                          className={input}
                          placeholder="GST %"
                          value={r.gst}
                          onChange={(e) => patchRow(i, { gst: e.target.value })}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {ok ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <Check className="h-3 w-3" />{" "}
                            {m.status === "ambiguous" ? "Chosen" : "Matched"}
                          </span>
                        ) : (
                          <span className="text-amber-600">
                            {m.status === "ambiguous" ? "Several fit, pick one" : "Needs a product"}
                          </span>
                        )}
                        {r.item.od_mm && ` · ${r.item.od_mm} mm`}
                        {r.item.pn && ` · PN ${r.item.pn}`}
                        {r.item.grade && ` · ${r.item.grade}`}
                      </p>
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-wrap gap-2">
                <Button disabled={!picked.length} onClick={() => createQuote()}>
                  Create draft quote ({picked.length})
                </Button>
                <Button
                  variant="outline"
                  disabled={!picked.length}
                  onClick={() => createQuote(true)}
                  title="Saves the quote, then opens the print dialog: choose Save as PDF"
                >
                  <FileText className="h-4 w-4" /> Create quote + PDF
                </Button>
                <Button
                  variant="outline"
                  disabled={!rows.length}
                  onClick={() => {
                    void navigator.clipboard.writeText(reply).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy reply
                </Button>
              </div>
              <pre className="whitespace-pre-wrap rounded-lg bg-secondary p-3 text-xs">{reply}</pre>
              {unmatched.length > 0 && (
                <p className="text-xs text-amber-600">
                  {unmatched.length} line{unmatched.length > 1 ? "s" : ""} without a product are
                  left out of the quote and listed in the reply as questions.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}

const blank = { name: null, company: null, phone: null, email: null, gstin: null };

// Type-ahead over the whole catalog: best matches when the box is empty, otherwise every word must appear.
function ProductPicker({
  products,
  candidates,
  value,
  invalid,
  placeholder,
  onChange,
}: {
  products: Product[];
  candidates: Product[];
  value: string;
  invalid: boolean;
  placeholder: string;
  onChange: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState(""); // "" = every category
  const current = products.find((p) => p.id === value);
  // Words match name/category ("plb 50"); numbers also work like the price extractor: "63 6 pe63" = OD, PN, grade.
  const inCat = products.filter((p) => !cat || p.category === cat);
  const shown = q.trim()
    ? inCat
        .filter(
          (p) =>
            matchesSearch(`${label(p)} ${p.name} ${CATEGORY_LABELS[p.category] ?? ""}`, q) ||
            productQueryFilter(q)(p),
        )
        .slice(0, 40)
    : cat
      ? inCat.slice(0, 40)
      : candidates;
  return (
    <div className="relative">
      <input
        aria-label="Matched product"
        className={cn(input, invalid && "border-amber-500")}
        placeholder={placeholder}
        value={open ? q : current ? label(current) : ""}
        onFocus={(e) => {
          setQ("");
          setOpen(true);
          e.currentTarget.select();
        }}
        onChange={(e) => setQ(e.target.value)}
        onBlur={() => setOpen(false)}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-72 min-w-72 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 text-sm shadow-lg">
          <li className="sticky top-0 flex flex-wrap gap-1 bg-popover p-1">
            {[["", "All"], ...Object.entries(CATEGORY_LABELS)].map(([id, name]) => (
              <button
                key={id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setCat(id ?? "");
                }}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-xs",
                  cat === id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-secondary",
                )}
              >
                {name}
              </button>
            ))}
          </li>
          {value && (
            <li>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-muted-foreground hover:bg-secondary"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear: use a custom item instead
              </button>
            </li>
          )}
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={cn(
                  "w-full rounded px-2 py-1.5 text-left hover:bg-secondary",
                  p.id === value && "bg-secondary font-medium",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(p.id);
                  setOpen(false);
                }}
              >
                {label(p)}
                <span className="ml-2 text-xs text-muted-foreground">
                  {CATEGORY_LABELS[p.category] ?? p.category}
                </span>
              </button>
            </li>
          ))}
          {!shown.length && (
            <li className="px-2 py-1.5 text-muted-foreground">
              {q.trim()
                ? "No product found. Fill the name and price below to add it as a custom item."
                : "Type to search, e.g. “plb 50” or “63 6 pe63” (size, PN, grade). Or pick a category above."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
