import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listMatrix, saveMatrix } from "@/data/api";
import { csvObjects, toCsv } from "@/lib/csv";

type Row = {
  uid: string;
  size_label: string;
  size_mm: string;
  od: string;
  id: string;
  wall: string;
};
type Cells = Record<string, { id: string; kg: string }>; // key: `${row uid}|${class}`

const cellCls =
  "h-8 w-full min-w-16 rounded border border-transparent bg-transparent px-1.5 text-right text-sm tabular-nums outline-none hover:border-input focus:border-primary focus:bg-background";
const CSV_COLS = ["size_label", "size_mm", "class", "kg_per_m", "od_mm", "id_mm", "wall_mm"];
const uid = () => crypto.randomUUID();
const num = (s: string) => (s.trim() === "" ? null : Number(s) > 0 ? Number(s) : null);

// Editable kg/m table for a subcategory: sizes down the side, classes (SN 4, SN 8, …) across the top.
// Saving rewrites the table and adds / updates / deactivates the subcategory's products to match.
export function WeightMatrix({
  categoryId,
  classLabel,
}: {
  categoryId: string;
  classLabel: string;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["matrix", categoryId],
    queryFn: () => listMatrix({ data: { category_id: categoryId } }),
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [cells, setCells] = useState<Cells>({});
  const [newClass, setNewClass] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!q.data) return;
    const byLabel = new Map<string, Row>();
    const c: Cells = {};
    for (const m of q.data) {
      let r = byLabel.get(m.size_label);
      if (!r) {
        r = {
          uid: m.id,
          size_label: m.size_label,
          size_mm: String(m.size_mm),
          od: m.od_mm == null ? "" : String(m.od_mm),
          id: m.id_mm == null ? "" : String(m.id_mm),
          wall: m.wall_mm == null ? "" : String(m.wall_mm),
        };
        byLabel.set(m.size_label, r);
      }
      c[`${r.uid}|${m.class}`] = { id: m.id, kg: String(m.kg_per_m) };
    }
    setRows([...byLabel.values()]);
    setClasses([...new Set(q.data.map((m) => m.class))]);
    setCells(c);
  }, [q.data]);

  const setRow = (u: string, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.uid === u ? { ...r, ...p } : r)));
  const setKg = (u: string, cls: string, kg: string) =>
    setCells((c) => ({ ...c, [`${u}|${cls}`]: { id: c[`${u}|${cls}`]?.id ?? uid(), kg } }));
  const addClass = () => {
    const v = newClass
      .trim()
      .toUpperCase()
      .replace(/^([A-Z]+)\s*(\d)/, "$1 $2");
    if (v && !classes.includes(v)) setClasses([...classes, v]);
    setNewClass("");
  };

  async function save() {
    const bad = rows.find((r) => !r.size_label.trim() || !(Number(r.size_mm) > 0));
    if (bad) return void toast.error("Every row needs a size label and a size in mm");
    const out = rows.flatMap((r) =>
      classes.flatMap((cls) => {
        const c = cells[`${r.uid}|${cls}`];
        if (!c || c.kg.trim() === "") return [];
        return [
          {
            id: c.id,
            grade: null,
            size_mm: Number(r.size_mm),
            size_label: r.size_label.trim(),
            class: cls,
            kg_per_m: Number(c.kg) || 0,
            od_mm: num(r.od),
            id_mm: num(r.id),
            wall_mm: num(r.wall),
          },
        ];
      }),
    );
    setBusy(true);
    try {
      const res = await saveMatrix({ data: { category_id: categoryId, cells: out } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["matrix", categoryId] }),
        qc.invalidateQueries({ queryKey: ["products"] }),
      ]);
      toast.success(
        `Saved: ${res.inserted} added, ${res.updated} updated, ${res.deactivated} deactivated`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message.slice(0, 160) : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const lines = rows.flatMap((r) =>
      classes
        .filter((cls) => cells[`${r.uid}|${cls}`]?.kg.trim())
        .map((cls) => [
          r.size_label,
          r.size_mm,
          cls,
          cells[`${r.uid}|${cls}`]!.kg,
          r.od,
          r.id,
          r.wall,
        ]),
    );
    const url = URL.createObjectURL(
      new Blob(["﻿" + toCsv([CSV_COLS, ...lines])], { type: "text/csv;charset=utf-8" }),
    );
    Object.assign(document.createElement("a"), {
      href: url,
      download: `weights-${categoryId}.csv`,
    }).click();
    URL.revokeObjectURL(url);
  }
  async function importCsv(file: File) {
    const objs = csvObjects(await file.text());
    if (!objs.length) return void toast.error("No rows in that file");
    const byLabel = new Map(rows.map((r) => [r.size_label, r]));
    const nextRows = [...rows];
    const nextCells = { ...cells };
    const nextClasses = [...classes];
    for (const o of objs) {
      const label = (o["size_label"] ?? "").trim();
      const cls = (o["class"] ?? "").trim().toUpperCase();
      if (!label || !cls) continue;
      let r = byLabel.get(label);
      if (!r) {
        r = { uid: uid(), size_label: label, size_mm: "", od: "", id: "", wall: "" };
        byLabel.set(label, r);
        nextRows.push(r);
      }
      Object.assign(r, {
        size_mm: o["size_mm"] || r.size_mm,
        od: o["od_mm"] || r.od,
        id: o["id_mm"] || r.id,
        wall: o["wall_mm"] || r.wall,
      });
      if (!nextClasses.includes(cls)) nextClasses.push(cls);
      const k = `${r.uid}|${cls}`;
      nextCells[k] = { id: nextCells[k]?.id ?? uid(), kg: o["kg_per_m"] ?? "" };
    }
    setRows(nextRows.map((r) => ({ ...r })));
    setClasses(nextClasses);
    setCells(nextCells);
    if (fileRef.current) fileRef.current.value = "";
    toast.message(`Loaded ${objs.length} rows. Check them, then Save.`);
  }

  const head = "px-2 py-1.5 text-right text-xs font-medium text-muted-foreground";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={newClass}
          onChange={(e) => setNewClass(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addClass()}
          placeholder={`+ ${classLabel || "class"} column, e.g. ${classLabel || "SN"} 8`}
          className="h-8 w-48 rounded-md border border-dashed border-input bg-background px-2 text-sm outline-none"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setRows([
              ...rows,
              { uid: uid(), size_label: "", size_mm: "", od: "", id: "", wall: "" },
            ])
          }
        >
          <Plus className="h-4 w-4" /> Size
        </Button>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={exportCsv}>
          <Download className="h-4 w-4" /> CSV
        </Button>
        <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> Import
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => e.target.files?.[0] && void importCsv(e.target.files[0])}
        />
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          Save weights
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">
                Size
              </th>
              <th className={head}>mm</th>
              <th className={head}>OD</th>
              <th className={head}>ID</th>
              <th className={head}>Wall</th>
              {classes.map((c) => (
                <th key={c} className={`${head} border-l border-border`}>
                  {c} <span className="font-normal">kg/m</span>
                  <button
                    onClick={() => setClasses(classes.filter((x) => x !== c))}
                    className="ml-1 text-muted-foreground/60 hover:text-destructive"
                    aria-label={`Remove ${c} column`}
                  >
                    ×
                  </button>
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.uid} className="border-t border-border">
                <td className="px-1">
                  <input
                    value={r.size_label}
                    onChange={(e) => setRow(r.uid, { size_label: e.target.value })}
                    placeholder="DN 110"
                    className={`${cellCls} text-left`}
                    aria-label="Size label"
                  />
                </td>
                {(["size_mm", "od", "id", "wall"] as const).map((k) => (
                  <td key={k} className="px-1">
                    <input
                      inputMode="decimal"
                      value={r[k]}
                      onChange={(e) => setRow(r.uid, { [k]: e.target.value })}
                      className={cellCls}
                      aria-label={k}
                    />
                  </td>
                ))}
                {classes.map((cls) => (
                  <td key={cls} className="border-l border-border px-1">
                    <input
                      inputMode="decimal"
                      value={cells[`${r.uid}|${cls}`]?.kg ?? ""}
                      onChange={(e) => setKg(r.uid, cls, e.target.value)}
                      className={cellCls}
                      aria-label={`${r.size_label} ${cls} kg per metre`}
                    />
                  </td>
                ))}
                <td>
                  <button
                    onClick={() => setRows(rows.filter((x) => x.uid !== r.uid))}
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${r.size_label || "row"}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={6 + classes.length}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No sizes yet. Add a {classLabel || "class"} column and a size, or import a CSV.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Blank cell = no product. Each filled cell becomes one product per grade; clearing a cell
        hides its products (quotes keep them).
      </p>
    </div>
  );
}
