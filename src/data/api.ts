import { createServerFn } from "@tanstack/react-start";
import { asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { computeTotals, nextQuoteNo, type Line } from "@/lib/quote";
import { authed } from "./auth.server";
import { getDb } from "./env.server";
import { brands, customers, price_lists, prices, products, quote_items, quotes } from "./schema";

const text = z.string().trim().max(1000);
const opt = text.transform((s) => s || null).nullable().optional();
const money = z.number().finite().min(0).max(1e9);
const gst = z.number().min(0).max(100);
const category = z.enum(["pipe", "sprinkler", "fitting"]);
const unit = z.enum(["m", "pc", "kg"]);

const toLine = (r: typeof quote_items.$inferSelect): Line => ({
  productId: r.product_id,
  category: r.category as Line["category"],
  description: r.description,
  hsn: r.hsn,
  unit: r.unit as Line["unit"],
  qty: r.qty,
  unitPrice: r.unit_price,
  gstRate: r.gst_rate,
});

// ---------- brands ----------
export const listBrands = createServerFn({ method: "GET" }).middleware([authed]).handler(async () => (await getDb()).select().from(brands).orderBy(brands.name));

export const saveBrand = createServerFn({ method: "POST" }).middleware([authed])
  .validator(
    z.object({
      id: z.string().optional(),
      code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,6}$/, "Code: 2–6 letters/digits"),
      name: text.min(1),
      tagline: opt, address: opt, phone: opt, gstin: opt, pan: opt,
      bank_name: opt, bank_account: opt, bank_ifsc: opt, upi_id: opt, terms: opt,
    })
  )
  .handler(async ({ data }) => {
    const db = await getDb();
    const { id, ...row } = data;
    if (id) await db.update(brands).set(row).where(eq(brands.id, id));
    else await db.insert(brands).values(row);
    return { ok: true };
  });

// ---------- customers ----------
export const listCustomers = createServerFn({ method: "GET" }).middleware([authed]).handler(async () => (await getDb()).select().from(customers).orderBy(customers.name));

export const addCustomer = createServerFn({ method: "POST" }).middleware([authed])
  .validator(z.object({ name: text.min(1), phone: opt, address: opt, gstin: opt }))
  .handler(async ({ data }) => {
    const [row] = await (await getDb()).insert(customers).values(data).returning();
    return row!;
  });

// ---------- catalog & price lists ----------
export const listPriceLists = createServerFn({ method: "GET" }).middleware([authed]).handler(async () =>
  (await getDb()).select().from(price_lists).orderBy(desc(price_lists.wef), price_lists.name)
);

// Every active product with its price in the given list (null = not priced in that list).
export const getPriceList = createServerFn({ method: "GET" }).middleware([authed])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    const [list] = await db.select().from(price_lists).where(eq(price_lists.id, data.id));
    if (!list) throw new Error("Price list not found");
    const rows = await db
      .select({ p: products, price: prices.price })
      .from(products)
      .leftJoin(prices, sql`${prices.product_id} = ${products.id} and ${prices.price_list_id} = ${data.id}`)
      .where(eq(products.active, 1))
      .orderBy(asc(products.sort), asc(products.name));
    return { list, items: rows.map(({ p, price }) => ({ ...p, price })) };
  });

export const setPrice = createServerFn({ method: "POST" }).middleware([authed])
  .validator(z.object({ listId: z.string(), productId: z.string(), price: money.nullable() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    if (data.price == null) {
      await db.delete(prices).where(sql`${prices.price_list_id} = ${data.listId} and ${prices.product_id} = ${data.productId}`);
    } else {
      await db
        .insert(prices)
        .values({ price_list_id: data.listId, product_id: data.productId, price: data.price })
        .onConflictDoUpdate({ target: [prices.price_list_id, prices.product_id], set: { price: data.price } });
    }
    return { ok: true };
  });

export const savePriceList = createServerFn({ method: "POST" }).middleware([authed])
  .validator(
    z.object({
      id: z.string().optional(),
      name: text.min(1),
      wef: opt,
      prices_include_gst: z.boolean(),
      copyFrom: z.string().optional(), // new list starts with another list's prices
    })
  )
  .handler(async ({ data }) => {
    const db = await getDb();
    const row = { name: data.name, wef: data.wef ?? null, prices_include_gst: data.prices_include_gst ? 1 : 0 };
    if (data.id) {
      await db.update(price_lists).set(row).where(eq(price_lists.id, data.id));
      return { id: data.id };
    }
    const id = crypto.randomUUID();
    await db.insert(price_lists).values({ id, ...row });
    if (data.copyFrom) {
      await db.run(
        sql`insert into prices (price_list_id, product_id, price) select ${id}, product_id, price from prices where price_list_id = ${data.copyFrom}`
      );
    }
    return { id };
  });

export const saveProduct = createServerFn({ method: "POST" }).middleware([authed])
  .validator(
    z.object({
      id: z.string().optional(),
      category,
      name: text.min(1),
      grade: opt, pn: opt, inch: opt, roll_lengths: opt, hsn: opt,
      size_mm: z.number().int().min(1).max(5000).nullable(),
      unit,
      gst_rate: gst,
      active: z.boolean().default(true),
    })
  )
  .handler(async ({ data }) => {
    const db = await getDb();
    const { id, active, ...rest } = data;
    const row = { ...rest, active: active ? 1 : 0 };
    if (id) await db.update(products).set(row).where(eq(products.id, id));
    else await db.insert(products).values({ ...row, sort: 1000 });
    return { ok: true };
  });

// ---------- quotes ----------
export const listQuotes = createServerFn({ method: "GET" }).middleware([authed]).handler(async () => {
  const db = await getDb();
  const rows = await db
    .select({ q: quotes, brand: brands.name, customer: customers.name })
    .from(quotes)
    .leftJoin(brands, eq(brands.id, quotes.brand_id))
    .leftJoin(customers, eq(customers.id, quotes.customer_id))
    .orderBy(desc(quotes.created_at))
    .limit(200);
  const items = rows.length ? await db.select().from(quote_items).where(inArray(quote_items.quote_id, rows.map((r) => r.q.id))) : [];
  return rows.map(({ q, brand, customer }) => ({
    id: q.id,
    quote_no: q.quote_no,
    status: q.status,
    quote_date: q.quote_date,
    brand_name: brand,
    customer_name: customer,
    total: computeTotals(items.filter((i) => i.quote_id === q.id).map(toLine), q.extra_charges, {
      inclusive: !!q.prices_include_gst,
      igst: !!q.igst,
    }).total,
  }));
});

export const getQuote = createServerFn({ method: "GET" }).middleware([authed])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    const [q] = await db.select().from(quotes).where(eq(quotes.id, data.id));
    if (!q) throw new Error("Quote not found");
    const [[brand], customer, items] = await Promise.all([
      db.select().from(brands).where(eq(brands.id, q.brand_id)),
      q.customer_id ? db.select().from(customers).where(eq(customers.id, q.customer_id)) : Promise.resolve([]),
      db.select().from(quote_items).where(eq(quote_items.quote_id, q.id)).orderBy(quote_items.position),
    ]);
    return { quote: q, brand: brand ?? null, customer: customer[0] ?? null, lines: items.map(toLine) };
  });

export const createQuote = createServerFn({ method: "POST" }).middleware([authed])
  .validator(
    z.object({
      brandId: z.string(),
      priceListId: z.string().nullable(),
      customerId: z.string().nullable(),
      newCustomer: z.object({ name: text.min(1), phone: opt, gstin: opt }).nullable(),
      inclusive: z.boolean(),
      igst: z.boolean(),
      extra: money,
      notes: opt,
      lines: z
        .array(
          z.object({
            productId: z.string().nullable(),
            category,
            description: text.min(1),
            hsn: opt,
            unit,
            qty: z.number().positive().max(1e7),
            unitPrice: money,
            gstRate: gst,
          })
        )
        .min(1)
        .max(100),
    })
  )
  .handler(async ({ data, context }) => {
    const db = await getDb();
    const [brand] = await db.select().from(brands).where(eq(brands.id, data.brandId));
    if (!brand) throw new Error("Brand not found");

    let customerId = data.customerId;
    if (!customerId && data.newCustomer) {
      const [c] = await db.insert(customers).values(data.newCustomer).returning({ id: customers.id });
      if (!c) throw new Error("Could not create customer");
      customerId = c.id;
    }
    const [counted] = await db.select({ n: count() }).from(quotes).where(eq(quotes.brand_id, brand.id));
    const n = counted?.n ?? 0;
    const quoteId = crypto.randomUUID();
    // Quote no. is unique; if two people save at once the batch fails atomically and we try the next number.
    for (let i = 0; i < 5; i++) {
      try {
        await db.batch([
          db.insert(quotes).values({
            id: quoteId,
            quote_no: nextQuoteNo(brand.code, n + i),
            brand_id: brand.id,
            customer_id: customerId,
            price_list_id: data.priceListId,
            quote_date: new Date().toISOString().slice(0, 10),
            prices_include_gst: data.inclusive ? 1 : 0,
            igst: data.igst ? 1 : 0,
            extra_charges: data.extra,
            notes: data.notes ?? null,
            created_by: context.user,
          }),
          ...data.lines.map((l, position) =>
            db.insert(quote_items).values({
              quote_id: quoteId,
              position,
              product_id: l.productId,
              category: l.category,
              description: l.description,
              hsn: l.hsn ?? null,
              unit: l.unit,
              qty: l.qty,
              unit_price: l.unitPrice,
              gst_rate: l.gstRate,
            })
          ),
        ]);
        return { id: quoteId };
      } catch (e) {
        if (!String(e).includes("UNIQUE") || i === 4) throw e;
      }
    }
    throw new Error("unreachable");
  });

export const setQuoteStatus = createServerFn({ method: "POST" }).middleware([authed])
  .validator(z.object({ id: z.string(), status: z.enum(["draft", "sent", "won", "lost"]) }))
  .handler(async ({ data }) => {
    await (await getDb()).update(quotes).set({ status: data.status, updated_at: new Date().toISOString() }).where(eq(quotes.id, data.id));
    return { ok: true };
  });

export const deleteQuote = createServerFn({ method: "POST" }).middleware([authed])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.batch([db.delete(quote_items).where(eq(quote_items.quote_id, data.id)), db.delete(quotes).where(eq(quotes.id, data.id))]);
    return { ok: true };
  });
