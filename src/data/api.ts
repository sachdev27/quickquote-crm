import { createServerFn } from "@tanstack/react-start";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { computeTotals, nextQuoteNo, type Line } from "@/lib/quote";
import { authed } from "./auth.server";
import { getDb } from "./env.server";
import {
  brands,
  customers,
  products,
  quote_items,
  quotes,
  rate_groups,
  rate_presets,
  rate_profiles,
  rates,
  brand_raw,
} from "./schema";

const text = z.string().trim().max(1000);
const opt = text
  .transform((s) => s || null)
  .nullable()
  .optional();
const money = z.number().finite().min(0).max(1e9);
const gst = z.number().min(0).max(100);
const category = z.enum(["pipe", "sprinkler", "fitting"]);
const unit = z.enum(["m", "pc", "kg"]);

const toLine = (r: typeof quote_items.$inferSelect): Line => ({
  productId: r.product_id,
  rateGroupId: null,
  category: r.category as Line["category"],
  description: r.description,
  hsn: r.hsn,
  unit: r.unit as Line["unit"],
  qty: r.qty,
  weightKg: r.weight_kg,
  rateKg: r.rate_kg,
  unitPrice: r.unit_price,
  gstRate: r.gst_rate,
});

// ---------- brands ----------
export const listBrands = createServerFn({ method: "GET" })
  .middleware([authed])
  .handler(async () => (await getDb()).select().from(brands).orderBy(brands.name));

export const saveBrand = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(
    z.object({
      id: z.string().optional(),
      code: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9]{2,6}$/, "Code: 2–6 letters/digits"),
      name: text.min(1),
      tagline: opt,
      address: opt,
      phone: opt,
      gstin: opt,
      pan: opt,
      bank_name: opt,
      bank_account: opt,
      bank_ifsc: opt,
      upi_id: opt,
      terms: opt,
      default_preset_id: opt,
    }),
  )
  .handler(async ({ data }) => {
    const db = await getDb();
    const { id, ...row } = data;
    if (id) await db.update(brands).set(row).where(eq(brands.id, id));
    else await db.insert(brands).values(row);
    return { ok: true };
  });

export const deleteBrand = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    const [used] = await db.select({ n: count() }).from(quotes).where(eq(quotes.brand_id, data.id));
    if (used?.n) throw new Error(`Brand is on ${used.n} quote(s); it can't be deleted.`);
    await db.delete(brands).where(eq(brands.id, data.id));
    return { ok: true };
  });

// ---------- customers ----------
export const listCustomers = createServerFn({ method: "GET" })
  .middleware([authed])
  .handler(async () => (await getDb()).select().from(customers).orderBy(customers.name));

export const addCustomer = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ name: text.min(1), phone: opt, address: opt, gstin: opt }))
  .handler(async ({ data }) => {
    const [row] = await (await getDb()).insert(customers).values(data).returning();
    return row!;
  });

export const updateCustomer = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(
    z.object({
      id: z.string(),
      name: text.min(1),
      phone: opt,
      address: opt,
      gstin: opt,
      notes: opt,
    }),
  )
  .handler(async ({ data }) => {
    const { id, ...row } = data;
    await (await getDb()).update(customers).set(row).where(eq(customers.id, id));
    return { ok: true };
  });

// Quotes keep their history: the FK sets customer_id to null, so old quotes show "walk-in".
export const deleteCustomer = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.batch([
      db.update(quotes).set({ customer_id: null }).where(eq(quotes.customer_id, data.id)),
      db.delete(customers).where(eq(customers.id, data.id)),
    ]);
    return { ok: true };
  });

// ---------- rate cards & products ----------
// Everything the pricing engine needs in one call: presets × groups → rate values.
export const listPricing = createServerFn({ method: "GET" })
  .middleware([authed])
  .handler(async () => {
    const db = await getDb();
    const [profiles, presets, groups, values, brandRaw] = await Promise.all([
      db
        .select()
        .from(rate_profiles)
        .orderBy(asc(rate_profiles.sort), asc(rate_profiles.created_at)),
      db.select().from(rate_presets).orderBy(asc(rate_presets.sort), asc(rate_presets.name)),
      db.select().from(rate_groups).orderBy(asc(rate_groups.sort), asc(rate_groups.name)),
      db.select().from(rates),
      db.select().from(brand_raw),
    ]);
    const activeProfileId = profiles.find((p) => p.active)?.id ?? profiles[0]?.id ?? "";
    return { profiles, activeProfileId, presets, groups, rates: values, brandRaw };
  });

const rateValues = z.object({
  raw_kg: money,
  raw_kg_non_isi: money.nullable(),
  production_kg: money,
  transport_kg: money,
  margin: money,
  margin_is_pct: z.boolean(),
});

export const saveRate = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(
    rateValues.extend({ profile_id: z.string(), preset_id: z.string(), group_id: z.string() }),
  )
  .handler(async ({ data }) => {
    const row = { ...data, margin_is_pct: data.margin_is_pct ? 1 : 0 };
    await (
      await getDb()
    )
      .insert(rates)
      .values(row)
      .onConflictDoUpdate({
        target: [rates.profile_id, rates.preset_id, rates.group_id],
        set: row,
      });
    return { ok: true };
  });

// One change across many presets × groups, e.g. "raw material +₹5 for PE63 in every preset".
// ponytail: only updates combos that already have a row; add the rate first for brand-new preset/group pairs.
export const bulkUpdateRates = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(
    z.object({
      profileId: z.string(),
      field: z.enum(["raw_kg", "raw_kg_non_isi", "production_kg", "transport_kg", "margin"]),
      mode: z.enum(["set", "add"]),
      value: z.number().finite().min(-1e6).max(1e6),
      presetIds: z.array(z.string()).min(1),
      groupIds: z.array(z.string()).min(1),
    }),
  )
  .handler(async ({ data }) => {
    const col = rates[data.field];
    // non-ISI raw may be unset: "change by" then starts from the ISI raw price
    const base = data.field === "raw_kg_non_isi" ? sql`coalesce(${col}, ${rates.raw_kg})` : col;
    const expr =
      data.mode === "set" ? sql`${Math.max(0, data.value)}` : sql`max(0, ${base} + ${data.value})`;
    const res = await (
      await getDb()
    )
      .update(rates)
      .set({ [data.field]: expr })
      .where(
        and(
          eq(rates.profile_id, data.profileId),
          inArray(rates.preset_id, data.presetIds),
          inArray(rates.group_id, data.groupIds),
        ),
      );
    return { updated: res.meta.changes ?? 0 };
  });

// New preset starts as a copy of another, so only the differences need typing.
export const savePreset = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(
    z.object({ id: z.string().optional(), name: text.min(1), copyFrom: z.string().optional() }),
  )
  .handler(async ({ data }) => {
    const db = await getDb();
    if (data.id) {
      await db.update(rate_presets).set({ name: data.name }).where(eq(rate_presets.id, data.id));
      return { id: data.id };
    }
    const id = crypto.randomUUID();
    await db.insert(rate_presets).values({ id, name: data.name, sort: 100 });
    if (data.copyFrom) {
      await db.run(
        sql`insert into rates (profile_id, preset_id, group_id, raw_kg, raw_kg_non_isi, production_kg, transport_kg, margin, margin_is_pct)
            select profile_id, ${id}, group_id, raw_kg, raw_kg_non_isi, production_kg, transport_kg, margin, margin_is_pct from rates where preset_id = ${data.copyFrom}`,
      );
    }
    return { id };
  });

// raw_kg null clears the brand's own price (falls back to the preset raw).
export const saveBrandRaw = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(
    z.object({
      profile_id: z.string(),
      brand_id: z.string(),
      group_id: z.string(),
      raw_kg: money.nullable(),
      raw_kg_non_isi: money.nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const db = await getDb();
    const key = and(
      eq(brand_raw.profile_id, data.profile_id),
      eq(brand_raw.brand_id, data.brand_id),
      eq(brand_raw.group_id, data.group_id),
    );
    if (data.raw_kg == null) await db.delete(brand_raw).where(key);
    else
      await db
        .insert(brand_raw)
        .values({ ...data, raw_kg: data.raw_kg })
        .onConflictDoUpdate({
          target: [brand_raw.profile_id, brand_raw.brand_id, brand_raw.group_id],
          set: { raw_kg: data.raw_kg, raw_kg_non_isi: data.raw_kg_non_isi },
        });
    return { ok: true };
  });

// Profiles: a complete set of values for a period. New ones copy another so only changes need typing.
export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(
    z.object({ id: z.string().optional(), name: text.min(1), copyFrom: z.string().optional() }),
  )
  .handler(async ({ data }) => {
    const db = await getDb();
    if (data.id) {
      await db.update(rate_profiles).set({ name: data.name }).where(eq(rate_profiles.id, data.id));
      return { id: data.id };
    }
    const id = crypto.randomUUID();
    await db.insert(rate_profiles).values({ id, name: data.name, sort: 100 });
    if (data.copyFrom) {
      await db.run(
        sql`insert into rates (profile_id, preset_id, group_id, raw_kg, raw_kg_non_isi, production_kg, transport_kg, margin, margin_is_pct)
            select ${id}, preset_id, group_id, raw_kg, raw_kg_non_isi, production_kg, transport_kg, margin, margin_is_pct from rates where profile_id = ${data.copyFrom}`,
      );
      await db.run(
        sql`insert into brand_raw (profile_id, brand_id, group_id, raw_kg, raw_kg_non_isi)
            select ${id}, brand_id, group_id, raw_kg, raw_kg_non_isi from brand_raw where profile_id = ${data.copyFrom}`,
      );
    }
    return { id };
  });

export const setActiveProfile = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.batch([
      db.update(rate_profiles).set({ active: 0 }),
      db.update(rate_profiles).set({ active: 1 }).where(eq(rate_profiles.id, data.id)),
    ]);
    return { ok: true };
  });

export const deleteProfile = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    const [p] = await db.select().from(rate_profiles).where(eq(rate_profiles.id, data.id));
    if (p?.active)
      throw new Error("This is the active profile. Make another profile active first.");
    await db.batch([
      db.delete(rates).where(eq(rates.profile_id, data.id)),
      db.delete(brand_raw).where(eq(brand_raw.profile_id, data.id)),
      db.delete(rate_profiles).where(eq(rate_profiles.id, data.id)),
    ]);
    return { ok: true };
  });

export const deletePreset = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.batch([
      db.delete(rates).where(eq(rates.preset_id, data.id)),
      db.delete(rate_presets).where(eq(rate_presets.id, data.id)),
    ]);
    return { ok: true };
  });

export const saveGroup = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(
    z.object({
      id: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9_-]{2,20}$/, "Key: 2–20 letters/digits"),
      name: text.min(1),
    }),
  )
  .handler(async ({ data }) => {
    await (
      await getDb()
    )
      .insert(rate_groups)
      .values({ ...data, sort: 100 })
      .onConflictDoUpdate({ target: rate_groups.id, set: { name: data.name } });
    return { ok: true };
  });

export const deleteGroup = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    const [used] = await db
      .select({ n: count() })
      .from(products)
      .where(and(eq(products.rate_group_id, data.id), eq(products.active, 1)));
    if (used?.n)
      throw new Error(`${used.n} product(s) use this rate group. Move or remove them first.`);
    // removed (inactive) products still point at the group; quotes only keep a snapshot, so drop them too
    await db.batch([
      db.delete(products).where(eq(products.rate_group_id, data.id)),
      db.delete(rates).where(eq(rates.group_id, data.id)),
      db.delete(rate_groups).where(eq(rate_groups.id, data.id)),
    ]);
    return { ok: true };
  });

export const listProducts = createServerFn({ method: "GET" })
  .middleware([authed])
  .handler(async () =>
    (await getDb())
      .select()
      .from(products)
      .where(eq(products.active, 1))
      .orderBy(asc(products.sort), asc(products.name)),
  );

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(
    z.object({
      id: z.string().optional(),
      category,
      rate_group_id: z.string().min(1),
      name: text.min(1),
      grade: opt,
      roll: opt,
      pn: opt,
      inch: opt,
      roll_lengths: opt,
      hsn: opt,
      size_mm: z.number().int().min(1).max(5000).nullable(),
      unit,
      weight_kg: z.number().finite().min(0).max(10000),
      gst_rate: gst,
      active: z.boolean().default(true),
    }),
  )
  .handler(async ({ data }) => {
    const db = await getDb();
    const { id, active, ...rest } = data;
    const row = { ...rest, active: active ? 1 : 0 };
    if (id) {
      await db.update(products).set(row).where(eq(products.id, id));
      return { id };
    }
    const newId = crypto.randomUUID();
    await db.insert(products).values({ ...row, id: newId, sort: 1000 });
    return { id: newId };
  });

// Inline weight edit from the products screen.
// CSV import: rows with a known id update that product, the rest are added.
const importRow = z.object({
  id: z.string().optional(),
  category,
  rate_group_id: z.string().min(1),
  name: text.min(1),
  grade: opt,
  roll: opt,
  pn: opt,
  inch: opt,
  roll_lengths: opt,
  hsn: opt,
  size_mm: z.number().int().min(1).max(5000).nullable(),
  unit,
  weight_kg: z.number().finite().min(0).max(10000),
  gst_rate: gst,
});

export const importProducts = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ rows: z.array(importRow).min(1).max(2000) }))
  .handler(async ({ data }) => {
    const db = await getDb();
    const groups = new Set(
      (await db.select({ id: rate_groups.id }).from(rate_groups)).map((g) => g.id),
    );
    const bad = data.rows.find((r) => !groups.has(r.rate_group_id));
    if (bad)
      throw new Error(
        `Unknown rate group "${bad.rate_group_id}" for ${bad.name}. Add it under Pricing first.`,
      );
    const existing = new Set(
      (await db.select({ id: products.id }).from(products)).map((p) => p.id),
    );
    let added = 0;
    let updated = 0;
    const stmts = data.rows.map((r) => {
      const { id, ...row } = r;
      if (id && existing.has(id)) {
        updated++;
        return db
          .update(products)
          .set({ ...row, active: 1 })
          .where(eq(products.id, id));
      }
      added++;
      return db
        .insert(products)
        .values({ ...row, id: id || crypto.randomUUID(), sort: 1000, active: 1 });
    });
    // ponytail: chunks of 100 keep each D1 request small; a failure mid-way leaves earlier chunks applied.
    for (let i = 0; i < stmts.length; i += 100) {
      const [first, ...rest] = stmts.slice(i, i + 100);
      if (first) await db.batch([first, ...rest]);
    }
    return { added, updated };
  });

export const setProductWeight = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ id: z.string(), weight_kg: z.number().finite().min(0).max(10000) }))
  .handler(async ({ data }) => {
    await (
      await getDb()
    )
      .update(products)
      .set({ weight_kg: data.weight_kg })
      .where(eq(products.id, data.id));
    return { ok: true };
  });

// ---------- quotes ----------
export const listQuotes = createServerFn({ method: "GET" })
  .middleware([authed])
  .handler(async () => {
    const db = await getDb();
    const rows = await db
      .select({ q: quotes, brand: brands.name, customer: customers.name })
      .from(quotes)
      .leftJoin(brands, eq(brands.id, quotes.brand_id))
      .leftJoin(customers, eq(customers.id, quotes.customer_id))
      .orderBy(desc(quotes.created_at))
      .limit(200);
    const items = rows.length
      ? await db
          .select()
          .from(quote_items)
          .where(
            inArray(
              quote_items.quote_id,
              rows.map((r) => r.q.id),
            ),
          )
      : [];
    return rows.map(({ q, brand, customer }) => ({
      id: q.id,
      quote_no: q.quote_no,
      status: q.status,
      quote_date: q.quote_date,
      brand_name: brand,
      customer_id: q.customer_id,
      customer_name: customer,
      total: computeTotals(items.filter((i) => i.quote_id === q.id).map(toLine), q.extra_charges, {
        inclusive: false,
        igst: !!q.igst,
      }).total,
    }));
  });

export const getQuote = createServerFn({ method: "GET" })
  .middleware([authed])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    const [q] = await db.select().from(quotes).where(eq(quotes.id, data.id));
    if (!q) throw new Error("Quote not found");
    const [[brand], customer, items] = await Promise.all([
      db.select().from(brands).where(eq(brands.id, q.brand_id)),
      q.customer_id
        ? db.select().from(customers).where(eq(customers.id, q.customer_id))
        : Promise.resolve([]),
      db
        .select()
        .from(quote_items)
        .where(eq(quote_items.quote_id, q.id))
        .orderBy(quote_items.position),
    ]);
    return {
      quote: q,
      brand: brand ?? null,
      customer: customer[0] ?? null,
      lines: items.map(toLine),
    };
  });

export const createQuote = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(
    z.object({
      brandId: z.string(),
      customerId: z.string().nullable(),
      presetId: z.string().nullable(),
      profileId: z.string().nullable(),
      nonIsi: z.boolean().default(false),
      newCustomer: z.object({ name: text.min(1), phone: opt, gstin: opt }).nullable(),
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
            weightKg: z.number().finite().min(0).max(10000),
            rateKg: money,
            unitPrice: money,
            gstRate: gst,
          }),
        )
        .min(1)
        .max(100),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = await getDb();
    const [brand] = await db.select().from(brands).where(eq(brands.id, data.brandId));
    if (!brand) throw new Error("Brand not found");

    let customerId = data.customerId;
    if (!customerId && data.newCustomer) {
      const [c] = await db
        .insert(customers)
        .values(data.newCustomer)
        .returning({ id: customers.id });
      if (!c) throw new Error("Could not create customer");
      customerId = c.id;
    }
    const [counted] = await db
      .select({ n: count() })
      .from(quotes)
      .where(eq(quotes.brand_id, brand.id));
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
            preset_id: data.presetId,
            profile_id: data.profileId,
            non_isi: data.nonIsi ? 1 : 0,
            quote_date: new Date().toISOString().slice(0, 10),
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
              weight_kg: l.weightKg,
              rate_kg: l.rateKg,
              unit_price: l.unitPrice,
              gst_rate: l.gstRate,
            }),
          ),
        ]);
        return { id: quoteId };
      } catch (e) {
        if (!String(e).includes("UNIQUE") || i === 4) throw e;
      }
    }
    throw new Error("unreachable");
  });

export const setQuoteStatus = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ id: z.string(), status: z.enum(["draft", "sent", "won", "lost"]) }))
  .handler(async ({ data }) => {
    await (
      await getDb()
    )
      .update(quotes)
      .set({ status: data.status, updated_at: new Date().toISOString() })
      .where(eq(quotes.id, data.id));
    return { ok: true };
  });

export const deleteQuote = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.batch([
      db.delete(quote_items).where(eq(quote_items.quote_id, data.id)),
      db.delete(quotes).where(eq(quotes.id, data.id)),
    ]);
    return { ok: true };
  });
