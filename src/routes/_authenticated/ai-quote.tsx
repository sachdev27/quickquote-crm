import { useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, FileUp, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { listProducts } from "@/data/api";
import { extractEnquiry } from "@/data/ai";
import {
  ACCEPTED_MIME,
  MAX_FILE_BYTES,
  type ExtractedItem,
  type Extraction,
} from "@/lib/ai/inbound";
import { AI_DRAFT_KEY, matchItem, quoteQty, replyDraft, type AiDraft } from "@/lib/ai/match";
import { pnNumber } from "@/lib/weights";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ai-quote")({
  head: () => ({ meta: [{ title: "AI Quote — Tarko CRM" }] }),
  component: AiQuotePage,
});

type Product = Awaited<ReturnType<typeof listProducts>>[number];
type Row = { item: ExtractedItem; productId: string };

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

  const run = useMutation({
    mutationFn: async () => {
      const attachments = await Promise.all(
        files.map(async (f) => ({ name: f.name, mime: f.type, base64: await toBase64(f) })),
      );
      return extractEnquiry({ data: { source: "upload", text, attachments } });
    },
    onSuccess: ({ extraction }) => {
      setCustomer(extraction.customer);
      setNotes(extraction.notes);
      setRows(
        extraction.items.map((item) => {
          const m = matchItem(item, products);
          return { item, productId: m.status === "matched" ? m.candidates[0]!.id : "" };
        }),
      );
      if (!extraction.items.length) toast.message("No product lines found in that enquiry");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Extraction failed"),
  });

  const addFiles = (list: FileList | null) => {
    const ok: File[] = [];
    for (const f of Array.from(list ?? [])) {
      if (!ACCEPTED_MIME.includes(f.type)) toast.error(`${f.name}: use a PDF, image or .txt`);
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
  const picked = (rows ?? []).filter((r) => byId.has(r.productId));
  const unmatched = (rows ?? []).filter((r) => !byId.has(r.productId));
  const customerName = customer?.company || customer?.name || null;

  const reply = replyDraft({
    customer: customer?.name ?? customerName,
    lines: picked.map((r) => {
      const p = byId.get(r.productId)!;
      return {
        title: label(p),
        qty: r.item.qty ?? 1,
        unit: r.item.unit === "rolls" ? "roll(s)" : p.unit === "m" ? "m" : "pc",
      };
    }),
    unmatched: unmatched.map((r) => r.item.raw),
  });

  const createQuote = () => {
    const merged = new Map<string, number>();
    for (const r of picked)
      merged.set(
        r.productId,
        (merged.get(r.productId) ?? 0) + quoteQty(r.item, byId.get(r.productId)!),
      );
    const draft: AiDraft = {
      customerName,
      notes: notes ? `AI enquiry: ${notes}` : null,
      lines: [...merged].map(([productId, qty]) => ({ productId, qty })),
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
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            placeholder="Paste the email or message here. Signatures and quoted replies are ignored."
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
              <FileUp className="h-4 w-4" /> Attach PDF, image or text
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept={ACCEPTED_MIME.join(",")}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <p className="mt-1 text-xs">Up to 3 files, 6 MB each. You can also drop them here.</p>
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
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? "Reading enquiry…" : "Extract items"}
          </Button>
          <p className="text-xs text-muted-foreground">
            The AI only reads the enquiry. Products are matched to your catalog and rates come from
            your pricing, never from the AI.
          </p>
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
              {notes && <p className="rounded-lg bg-secondary px-3 py-2 text-xs">Notes: {notes}</p>}

              <ul className="divide-y divide-border">
                {rows.map((r, i) => {
                  const m = matchItem(r.item, products);
                  const ok = byId.has(r.productId);
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
                        <select
                          aria-label="Matched product"
                          className={cn(input, !ok && "border-amber-500")}
                          value={r.productId}
                          onChange={(e) => patchRow(i, { productId: e.target.value })}
                        >
                          <option value="">
                            {m.status === "none" ? "No match: pick a product" : "Pick a product…"}
                          </option>
                          {(m.candidates.length ? m.candidates : products.slice(0, 0)).map((p) => (
                            <option key={p.id} value={p.id}>
                              {label(p)}
                            </option>
                          ))}
                          {ok && !m.candidates.some((p) => p.id === r.productId) && (
                            <option value={r.productId}>{label(byId.get(r.productId)!)}</option>
                          )}
                        </select>
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
                <Button disabled={!picked.length} onClick={createQuote}>
                  Create draft quote ({picked.length})
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
