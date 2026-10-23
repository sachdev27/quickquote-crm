import { useState } from "react";
import { toast } from "sonner";
import { Field, inputCls } from "@/components/qq";
import { Button } from "@/components/ui/button";
import { FITTING_PRODUCTS, FITTING_SIZES, fittingName, netPrice } from "@/lib/fitting";
import { GST_OPTIONS, fmtMoney, type Line } from "@/lib/quote";

const num = (s: string) => (s === "" || isNaN(+s) ? 0 : +s);

// Non-branded fitting: product + size (+ optional description), then quantity and price.
// An optional discount turns a printed list price into the net price that goes on the quote.
export function FittingForm({ onAdd }: { onAdd: (l: Line) => void }) {
  const [product, setProduct] = useState("");
  const [size, setSize] = useState("");
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [disc, setDisc] = useState("");
  const [gst, setGst] = useState(18);
  const [hsn, setHsn] = useState("3917 40 00");

  const net = disc ? netPrice(num(price), num(disc)) : num(price);

  function add() {
    if (!product.trim()) return void toast.error("Enter the product, e.g. Elbow 90°");
    if (num(qty) <= 0) return void toast.error("Enter a quantity");
    if (net <= 0) return void toast.error("Enter the price");
    onAdd({
      productId: null,
      rateGroupId: null,
      category: "fitting",
      description: fittingName(product, size, desc),
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
    setQty("1");
    setPrice("");
  }
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  return (
    <div className="space-y-2" onKeyDown={onEnter}>
      <Field label="Product">
        <input
          list="fitting-products"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          placeholder="e.g. Elbow 90°"
          className={inputCls}
        />
        <datalist id="fitting-products">
          {FITTING_PRODUCTS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Size (mm)">
          <input
            list="fitting-sizes"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="63 or 90x63"
            className={inputCls}
          />
          <datalist id="fitting-sizes">
            {FITTING_SIZES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
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
      <Field label="Description (optional)">
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="e.g. Electrofusion, SDR-11"
          className={inputCls}
        />
      </Field>
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
        <Field label="HSN">
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
