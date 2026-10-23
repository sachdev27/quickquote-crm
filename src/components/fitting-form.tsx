import { useEffect, useState } from "react";
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
  netPrice,
  pairSize,
} from "@/lib/fitting";
import { GST_OPTIONS, fmtMoney, type Line } from "@/lib/quote";

const num = (s: string) => (s === "" || isNaN(+s) ? 0 : +s);
const families = [...new Set(FITTING_LIST.map((d) => d.family))];

// Non-branded fitting: pick the product, then size (two sizes for reducers and tees), an optional
// description, quantity and price. An optional discount turns a printed list price into the net price.
export function FittingForm({ onAdd }: { onAdd: (l: Line) => void }) {
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
    staleTime: 60_000,
  });
  const [key, setKey] = useState(fittingKey(FITTING_LIST[0]!));
  const [other, setOther] = useState(""); // product typed by hand when "Other" is chosen
  const [size, setSize] = useState("");
  const [size2, setSize2] = useState("");
  const [desc, setDesc] = useState(FITTING_LIST[0]!.family);
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

  const def = FITTING_LIST.find((d) => fittingKey(d) === key);
  const product = def ? def.product : other.trim();
  const net = disc ? netPrice(num(price), num(disc)) : num(price);

  function pickProduct(k: string) {
    setKey(k);
    const d = FITTING_LIST.find((x) => fittingKey(x) === k);
    setDesc(d ? d.family : "");
    setSize2("");
  }

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

  const sizeInput = (value: string, set: (v: string) => void, label: string, ph: string) => (
    <Field label={label}>
      <input
        list="fitting-sizes"
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
              {FITTING_LIST.filter((d) => d.family === f).map((d) => (
                <option key={fittingKey(d)} value={fittingKey(d)}>
                  {d.product}
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
        {FITTING_SIZES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {def?.pair ? (
        <div className="grid grid-cols-2 gap-2">
          {sizeInput(size, setSize, product === "Saddle" ? "Pipe (mm)" : "Large (mm)", "90")}
          {sizeInput(size2, setSize2, product === "Saddle" ? "Outlet (mm)" : "Small (mm)", "63")}
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
