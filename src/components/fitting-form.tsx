import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Field, inputCls } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { getSettings } from "@/data/api";
import {
  FITTING_LIST,
  FITTING_SIZES,
  fittingKey,
  fittingName,
  groupFittings,
  netPrice,
  pairSize,
  type FittingGroup,
  type FittingRow,
} from "@/lib/fitting";
import { GST_OPTIONS, fmtMoney, type Line } from "@/lib/quote";

const num = (s: string) => (s === "" || isNaN(+s) ? 0 : +s);
// Built-in list, used only when the catalog has no fittings (everything was deleted).
const FALLBACK: FittingGroup[] = FITTING_LIST.map((d) => ({
  key: fittingKey(d),
  family: d.family,
  product: d.product,
  pair: !!d.pair,
  sizes: [],
  hsn: null,
  gst: 18,
}));

// Non-branded fitting: pick the product, then size (two sizes for reducers and tees), an optional
// description, quantity and price. An optional discount turns a printed list price into the net price.
export function FittingForm({
  onAdd,
  catalog,
}: {
  onAdd: (l: Line) => void;
  catalog: FittingRow[];
}) {
  const fromCatalog = useMemo(() => groupFittings(catalog), [catalog]);
  const groups = fromCatalog.length ? fromCatalog : FALLBACK;
  const families = [...new Set(groups.map((g) => g.family))];
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
    staleTime: 60_000,
  });
  const [key, setKey] = useState(groups[0]!.key);
  const [other, setOther] = useState(""); // product typed by hand when "Other" is chosen
  const [size, setSize] = useState("");
  const [size2, setSize2] = useState("");
  const [desc, setDesc] = useState(groups[0]!.family);
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [disc, setDisc] = useState("");
  const [gst, setGst] = useState(18);
  const [hsn, setHsn] = useState("3917 40 00");

  // The HSN/SAC and GST you set once under Products start every new line.
  useEffect(() => {
    if (!settings.data) return;
    setHsn(settings.data.fittingHsn);
    setGst(settings.data.fittingGst);
  }, [settings.data]);

  const def = groups.find((g) => g.key === key);
  // The picked product can vanish (deleted under Products): fall back to the first one.
  useEffect(() => {
    if (key !== "other" && !groups.some((g) => g.key === key)) setKey(groups[0]!.key);
  }, [groups, key]);
  const product = def ? def.product : other.trim();
  const net = disc ? netPrice(num(price), num(disc)) : num(price);

  // The HSN/SAC and GST kept on the product (set once under Products) start the line.
  function pickProduct(k: string) {
    setKey(k);
    const g = groups.find((x) => x.key === k);
    setDesc(g ? g.family : "");
    setSize("");
    setSize2("");
    if (g?.hsn) setHsn(g.hsn);
    if (g) setGst(g.gst);
  }

  // Size suggestions come from the catalog: one list for plain products, and for two-size products the
  // second list follows the first (90 -> 63, 75, 50 ...).
  const sizes = def?.sizes.length ? def.sizes : FITTING_SIZES;
  const firsts = [...new Set((def?.pair ? def.sizes : []).map((x) => x.split("x")[0]!))];
  const seconds = [
    ...new Set(
      (def?.pair ? def.sizes : [])
        .filter((x) => !size || x.startsWith(`${size}x`))
        .map((x) => x.split("x")[1]!),
    ),
  ];

  function add() {
    if (!product) return void toast.error("Pick or type the product");
    if (def?.pair && !(size && size2)) return void toast.error("Pick both sizes");
    if (num(qty) <= 0) return void toast.error("Enter a quantity");
    if (net <= 0) return void toast.error("Enter the price");
    onAdd({
      productId: null,
      rateGroupId: null,
      category: "fitting",
      description: fittingName(product, def?.pair ? pairSize(size, size2) : size, desc),
      hsn: hsn.trim() || null,
      unit: "pc",
      qty: num(qty),
      weightKg: 0,
      rateKg: 0,
      unitPrice: net,
      gstRate: gst,
    });
    // keep the product (the next size of the same fitting is the usual follow-up)
    setSize("");
    setSize2("");
    setQty("1");
    setPrice("");
  }
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  const sizeInput = (
    value: string,
    set: (v: string) => void,
    label: string,
    ph: string,
    list = "fitting-sizes",
  ) => (
    <Field label={label}>
      <input
        list={list}
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={ph}
        className={inputCls}
      />
    </Field>
  );

  return (
    <div className="space-y-2" onKeyDown={onEnter}>
      <Field label="Product">
        <select
          aria-label="Product"
          value={key}
          onChange={(e) => pickProduct(e.target.value)}
          className={inputCls}
        >
          {families.map((f) => (
            <optgroup key={f} label={f}>
              {groups
                .filter((g) => g.family === f)
                .map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.product}
                  </option>
                ))}
            </optgroup>
          ))}
          <option value="other">Other (type it)…</option>
        </select>
      </Field>
      {!def && (
        <input
          aria-label="Product name"
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="e.g. Ball valve"
          className={inputCls}
        />
      )}
      <datalist id="fitting-sizes">
        {(def?.pair ? (firsts.length ? firsts : FITTING_SIZES) : sizes).map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <datalist id="fitting-sizes-2">
        {(seconds.length ? seconds : FITTING_SIZES).map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      {def?.pair ? (
        <div className="grid grid-cols-2 gap-2">
          {sizeInput(
            size,
            setSize,
            product.startsWith("Saddle") ? "Pipe (mm)" : "Large (mm)",
            "90",
          )}
          {sizeInput(
            size2,
            setSize2,
            product.startsWith("Saddle") ? "Outlet (mm)" : "Small (mm)",
            "63",
            "fitting-sizes-2",
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {sizeInput(size, setSize, "Size (mm)", "63")}
          <Field label="Quantity (pcs)">
            <input
              inputMode="decimal"
              value={qty}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setQty(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {def?.pair && (
          <Field label="Quantity (pcs)">
            <input
              inputMode="decimal"
              value={qty}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setQty(e.target.value)}
              className={inputCls}
            />
          </Field>
        )}
        <Field label="Description (optional)">
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="e.g. SDR-11, 10 kg"
            className={inputCls}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={disc ? "List price ₹/pc" : "Price ₹/pc (ex-GST)"}>
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Discount % (optional)">
          <input
            inputMode="decimal"
            value={disc}
            onChange={(e) => setDisc(e.target.value)}
            placeholder="e.g. 40"
            className={inputCls}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="HSN/SAC">
          <input value={hsn} onChange={(e) => setHsn(e.target.value)} className={inputCls} />
        </Field>
        <Field label="GST">
          <select className={inputCls} value={gst} onChange={(e) => setGst(Number(e.target.value))}>
            {GST_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}%
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="min-w-0 text-xs text-muted-foreground tabular-nums">
          {net > 0 && num(qty) > 0 ? (
            <>
              {disc && <>Net {fmtMoney(net)}/pc · </>}
              <b className="text-sm text-foreground">{fmtMoney(net * num(qty))}</b> + GST
            </>
          ) : (
            "Enter quantity and price"
          )}
        </p>
        <Button className="h-11 shrink-0 rounded-xl px-6 font-semibold" onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}
