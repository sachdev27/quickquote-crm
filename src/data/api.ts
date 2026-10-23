import { createServerFn } from "@tanstack/react-start";
import { LOGO_MAX_CHARS, LOGO_RE } from "@/lib/logo";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { computeTotals, fmtMoney, nextQuoteNo, type Line } from "@/lib/quote";
import { describeChanges, type AuditSnap } from "@/lib/audit";
import { invoiceNoOf, invoicePrefix, todayIST } from "@/lib/invoice";
import { adminOnly, authed } from "./auth.server";
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
  terms,
  activities,
  users,
  enquiries,
  contacts,
  quote_audit,
  invoices,
  invoice_items,
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
  .middleware([adminOnly])
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
      // Empty string clears the logo.
      logo: z
        .string()
        .max(LOGO_MAX_CHARS)
        .refine((v) => v === "" || LOGO_RE.test(v), "Logo must be an SVG, PNG, JPG or WebP image")
        .transform((v) => v || null)
        .optional(),
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
  .middleware([adminOnly])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    const [used] = await db.select({ n: count() }).from(quotes).where(eq(quotes.brand_id, data.id));
    if (used?.n) throw new Error(`Brand is on ${used.n} quote(s); it can't be deleted.`);
    await db.delete(brands).where(eq(brands.id, data.id));
    return { ok: true };
  });

// ---------- terms ----------
export const listTerms = createServerFn({ method: "GET" })
  .middleware([authed])
  .handler(async () =>
    (await getDb()).select().from(terms).orderBy(asc(terms.sort), asc(terms.text)),
  );

export const saveTerm = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .validator(z.object({ id: z.string().optional(), text: text.min(1), default_on: z.boolean() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    const row = { text: data.text, default_on: data.default_on ? 1 : 0 };
    if (data.id) await db.update(terms).set(row).where(eq(terms.id, data.id));
    else await db.insert(terms).values({ ...row, sort: 1000 });
    return { ok: true };
  });

export const deleteTerm = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await (await getDb()).delete(terms).where(eq(terms.id, data.id));
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
  .middleware([adminOnly])
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
  .middleware([adminOnly])
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
  .middleware([adminOnly])
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
  .middleware([adminOnly])
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
  .middleware([adminOnly])
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
  .middleware([adminOnly])
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
  .middleware([adminOnly])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    const all = await db.select().from(rate_profiles).orderBy(desc(rate_profiles.created_at));
    const p = all.find((x) => x.id === data.id);
    if (!p) return { ok: true };
    if (all.length === 1) throw new Error("This is the only profile; at least one must remain.");
    // Deleting the active profile hands "active" to the newest remaining one, so quotes always have values.
    const next = p.active ? all.find((x) => x.id !== data.id) : undefined;
    await db.batch([
      db.delete(rates).where(eq(rates.profile_id, data.id)),
      db.delete(brand_raw).where(eq(brand_raw.profile_id, data.id)),
      db.delete(rate_profiles).where(eq(rate_profiles.id, data.id)),
      ...(next
        ? [db.update(rate_profiles).set({ active: 1 }).where(eq(rate_profiles.id, next.id))]
        : []),
    ]);
    return { ok: true, activated: next?.name ?? null };
  });

export const deletePreset = createServerFn({ method: "POST" })
  .middleware([adminOnly])
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
  .middleware([adminOnly])
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
  .middleware([adminOnly])
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
  .middleware([adminOnly])
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
  .middleware([adminOnly])
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
  .middleware([adminOnly])
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
      status: q.stage,
      quote_date: q.quote_date,
      brand_name: brand,
      customer_id: q.customer_id,
      customer_name: customer,
      created_by: q.created_by,
      updated_at: q.updated_at,
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
    const [[brand], customer, items, [invoice]] = await Promise.all([
      db.select().from(brands).where(eq(brands.id, q.brand_id)),
      q.customer_id
        ? db.select().from(customers).where(eq(customers.id, q.customer_id))
        : Promise.resolve([]),
      db
        .select()
        .from(quote_items)
        .where(eq(quote_items.quote_id, q.id))
        .orderBy(quote_items.position),
      db
        .select({ id: invoices.id, invoice_no: invoices.invoice_no })
        .from(invoices)
        .where(eq(invoices.quote_id, q.id)),
    ]);
    return {
      invoice: invoice ?? null,
      quote: q,
      brand: brand ?? null,
      customer: customer[0] ?? null,
      lines: items.map(toLine),
    };
  });

const quoteBody = z.object({
  brandId: z.string(),
  customerId: z.string().nullable(),
  presetId: z.string().nullable(),
  profileId: z.string().nullable(),
  nonIsi: z.boolean().default(false),
  terms: z.array(text.min(1)).max(30).default([]),
  newCustomer: z.object({ name: text.min(1), phone: opt, gstin: opt }).nullable(),
  enquiryId: z.string().nullable().default(null),
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
});

export const createQuote = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(quoteBody)
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
            terms: data.terms.length ? data.terms.join("\n") : null,
            quote_date: new Date().toISOString().slice(0, 10),
            igst: data.igst ? 1 : 0,
            extra_charges: data.extra,
            notes: data.notes ?? null,
            created_by: context.user,
          }),
          db.insert(quote_audit).values({
            quote_id: quoteId,
            by: context.user,
            what: `Created · ${data.lines.length} item${data.lines.length > 1 ? "s" : ""} · ${fmtMoney(
              computeTotals(
                data.lines.map((l) => ({ ...l, hsn: l.hsn ?? null })),
                data.extra,
                { inclusive: false, igst: data.igst },
              ).total,
            )}`,
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
        if (data.enquiryId) {
          // converting an enquiry: link it, and carry its call/visit history over to the quote
          await db.batch([
            db
              .update(enquiries)
              .set({ status: "converted", quote_id: quoteId, updated_at: new Date().toISOString() })
              .where(eq(enquiries.id, data.enquiryId)),
            db
              .update(activities)
              .set({ quote_id: quoteId })
              .where(eq(activities.enquiry_id, data.enquiryId)),
          ]);
        }
        return { id: quoteId, quoteNo: nextQuoteNo(brand.code, n + i) };
      } catch (e) {
        if (!String(e).includes("UNIQUE") || i === 4) throw e;
      }
    }
    throw new Error("unreachable");
  });

// Edit a saved quote: replaces header fields and lines, and logs one short audit row of what changed.
export const updateQuote = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(quoteBody.omit({ enquiryId: true }).extend({ id: z.string() }))
  .handler(async ({ data, context }) => {
    const db = await getDb();
    const [old] = await db.select().from(quotes).where(eq(quotes.id, data.id));
    if (!old) throw new Error("Quote not found");
    const [brand] = await db.select().from(brands).where(eq(brands.id, data.brandId));
    if (!brand) throw new Error("Brand not found");
    const oldItems = await db
      .select()
      .from(quote_items)
      .where(eq(quote_items.quote_id, old.id))
      .orderBy(quote_items.position);

    let customerId = data.customerId;
    if (!customerId && data.newCustomer) {
      const [c] = await db
        .insert(customers)
        .values(data.newCustomer)
        .returning({ id: customers.id });
      if (!c) throw new Error("Could not create customer");
      customerId = c.id;
    }
    const nameOf = async (id: string | null) =>
      id
        ? ((await db.select({ n: customers.name }).from(customers).where(eq(customers.id, id)))[0]
            ?.n ?? null)
        : null;
    const [oldBrand] = await db
      .select({ n: brands.name })
      .from(brands)
      .where(eq(brands.id, old.brand_id));
    const terms = data.terms.length ? data.terms.join("\n") : null;
    const lineOf = (l: Line) => ({
      description: l.description,
      unit: l.unit,
      qty: l.qty,
      weightKg: l.weightKg,
      rateKg: l.rateKg,
      unitPrice: l.unitPrice,
      gstRate: l.gstRate,
    });
    const before: AuditSnap = {
      customer: await nameOf(old.customer_id),
      brand: oldBrand?.n ?? null,
      igst: !!old.igst,
      nonIsi: !!old.non_isi,
      extra: old.extra_charges,
      notes: old.notes,
      terms: old.terms,
      lines: oldItems.map((i) => lineOf(toLine(i))),
    };
    const after: AuditSnap = {
      customer: await nameOf(customerId),
      brand: brand.name,
      igst: data.igst,
      nonIsi: data.nonIsi,
      extra: data.extra,
      notes: data.notes ?? null,
      terms,
      lines: data.lines.map((l) => lineOf(l as Line)),
    };
    const what = describeChanges(before, after);
    if (!what) return { ok: true, changed: false };

    await db.batch([
      db
        .update(quotes)
        .set({
          brand_id: brand.id,
          customer_id: customerId,
          preset_id: data.presetId,
          profile_id: data.profileId,
          non_isi: data.nonIsi ? 1 : 0,
          terms,
          igst: data.igst ? 1 : 0,
          extra_charges: data.extra,
          notes: data.notes ?? null,
          updated_at: new Date().toISOString(),
        })
        .where(eq(quotes.id, old.id)),
      db.delete(quote_items).where(eq(quote_items.quote_id, old.id)),
      ...data.lines.map((l, position) =>
        db.insert(quote_items).values({
          quote_id: old.id,
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
      db.insert(quote_audit).values({ quote_id: old.id, by: context.user, what }),
    ]);
    return { ok: true, changed: true };
  });

export const listAudit = createServerFn({ method: "GET" })
  .middleware([authed])
  .validator(z.object({ quoteId: z.string() }))
  .handler(async ({ data }) =>
    (await getDb())
      .select()
      .from(quote_audit)
      .where(eq(quote_audit.quote_id, data.quoteId))
      .orderBy(desc(quote_audit.at), desc(quote_audit.id))
      .limit(200),
  );

// ---------- tax invoices ----------
// Issue a tax invoice from a quotation. One per quote (asking again returns the existing one).
// The invoice copies the buyer and lines, so later quote edits never change it. The quote moves to Won.
export const createInvoiceFromQuote = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ quoteId: z.string() }))
  .handler(async ({ data, context }) => {
    const db = await getDb();
    const existing = async () =>
      (
        await db
          .select({ id: invoices.id, no: invoices.invoice_no })
          .from(invoices)
          .where(eq(invoices.quote_id, data.quoteId))
      )[0];
    const had = await existing();
    if (had) return { id: had.id, invoiceNo: had.no, created: false };

    const [q] = await db.select().from(quotes).where(eq(quotes.id, data.quoteId));
    if (!q) throw new Error("Quote not found");
    const [[brand], [cust], items] = await Promise.all([
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
    if (!brand) throw new Error("Brand not found");
    if (!items.length) throw new Error("The quote has no items");

    const date = todayIST();
    const prefix = invoicePrefix(brand.code, date);
    const [counted] = await db
      .select({ n: count() })
      .from(invoices)
      .where(sql`${invoices.invoice_no} like ${prefix + "%"}`);
    const n = counted?.n ?? 0;
    const id = crypto.randomUUID();
    const moveToWon = q.stage !== "won";
    // Invoice no. is unique; if two people issue at once the batch fails atomically and we take the next number.
    for (let i = 0; i < 5; i++) {
      const invoiceNo = invoiceNoOf(brand.code, date, n + i + 1);
      try {
        await db.batch([
          db.insert(invoices).values({
            id,
            invoice_no: invoiceNo,
            quote_id: q.id,
            brand_id: brand.id,
            invoice_date: date,
            igst: q.igst,
            extra_charges: q.extra_charges,
            notes: q.notes,
            terms: q.terms,
            buyer_name: cust?.name ?? null,
            buyer_address: cust?.address ?? null,
            buyer_phone: cust?.phone ?? null,
            buyer_gstin: cust?.gstin ?? null,
            created_by: context.user,
          }),
          ...items.map((it) =>
            db.insert(invoice_items).values({
              invoice_id: id,
              position: it.position,
              category: it.category,
              description: it.description,
              hsn: it.hsn,
              unit: it.unit,
              qty: it.qty,
              weight_kg: it.weight_kg,
              rate_kg: it.rate_kg,
              unit_price: it.unit_price,
              gst_rate: it.gst_rate,
            }),
          ),
          db.insert(quote_audit).values({
            quote_id: q.id,
            by: context.user,
            what: `Tax invoice ${invoiceNo} issued${moveToWon ? `; stage ${q.stage} → won` : ""}`,
          }),
          db
            .update(quotes)
            .set({ stage: "won", status: "won", updated_at: new Date().toISOString() })
            .where(eq(quotes.id, q.id)),
        ]);
        return { id, invoiceNo, created: true };
      } catch (e) {
        if (!String(e).includes("UNIQUE") || i === 4) throw e;
        const raced = await existing(); // someone else just issued this quote's invoice
        if (raced) return { id: raced.id, invoiceNo: raced.no, created: false };
      }
    }
    throw new Error("unreachable");
  });

const toInvoiceLine = (r: typeof invoice_items.$inferSelect): Line => ({
  productId: null,
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

export const getInvoice = createServerFn({ method: "GET" })
  .middleware([authed])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, data.id));
    if (!inv) throw new Error("Invoice not found");
    const [[brand], [quote], items] = await Promise.all([
      db.select().from(brands).where(eq(brands.id, inv.brand_id)),
      db
        .select({ no: quotes.quote_no, date: quotes.quote_date })
        .from(quotes)
        .where(eq(quotes.id, inv.quote_id)),
      db
        .select()
        .from(invoice_items)
        .where(eq(invoice_items.invoice_id, inv.id))
        .orderBy(invoice_items.position),
    ]);
    return {
      invoice: inv,
      brand: brand ?? null,
      quoteNo: quote?.no ?? null,
      quoteDate: quote?.date ?? null,
      lines: items.map(toInvoiceLine),
    };
  });

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([authed])
  .handler(async () => {
    const db = await getDb();
    const rows = await db
      .select({ inv: invoices, brand: brands.name })
      .from(invoices)
      .leftJoin(brands, eq(brands.id, invoices.brand_id))
      .orderBy(desc(invoices.created_at))
      .limit(300);
    const items = rows.length
      ? await db
          .select()
          .from(invoice_items)
          .where(
            inArray(
              invoice_items.invoice_id,
              rows.map((r) => r.inv.id),
            ),
          )
      : [];
    return rows.map(({ inv, brand }) => ({
      id: inv.id,
      invoice_no: inv.invoice_no,
      invoice_date: inv.invoice_date,
      quote_id: inv.quote_id,
      brand_name: brand,
      customer_name: inv.buyer_name,
      total: computeTotals(
        items.filter((i) => i.invoice_id === inv.id).map(toInvoiceLine),
        inv.extra_charges,
        { inclusive: false, igst: !!inv.igst },
      ).total,
    }));
  });

export const setQuoteStatus = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(
    z.object({ id: z.string(), status: z.enum(["draft", "sent", "negotiation", "won", "lost"]) }),
  )
  .handler(async ({ data, context }) => {
    const db = await getDb();
    const [q] = await db
      .select({ stage: quotes.stage, customer_id: quotes.customer_id })
      .from(quotes)
      .where(eq(quotes.id, data.id));
    if (!q) throw new Error("Quote not found");
    if (q.stage === data.status) return { ok: true };
    await db.batch([
      db.insert(quote_audit).values({
        quote_id: data.id,
        by: context.user,
        what: `Stage ${q.stage} → ${data.status}`,
      }),
      db
        .update(quotes)
        .set({
          stage: data.status,
          status: data.status === "negotiation" ? "sent" : data.status,
          updated_at: new Date().toISOString(),
        })
        .where(eq(quotes.id, data.id)),
      // stage moves are part of the deal's history
      db.insert(activities).values({
        quote_id: data.id,
        customer_id: q.customer_id,
        kind: "note",
        text: `Moved to ${data.status}`,
        created_by: context.user,
      }),
    ]);
    return { ok: true };
  });

// ---------- activities & follow-ups ----------
export const listActivities = createServerFn({ method: "GET" })
  .middleware([authed])
  .validator(z.object({ quoteId: z.string().optional(), enquiryId: z.string().optional() }))
  .handler(async ({ data }) =>
    (await getDb())
      .select()
      .from(activities)
      .where(
        data.quoteId
          ? eq(activities.quote_id, data.quoteId)
          : eq(activities.enquiry_id, data.enquiryId ?? ""),
      )
      .orderBy(desc(activities.created_at)),
  );

export const addActivity = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(
    z.object({
      quoteId: z.string().optional(),
      enquiryId: z.string().optional(),
      customerId: z.string().nullable().optional(),
      kind: z.enum(["call", "visit", "whatsapp", "email", "note", "followup"]),
      text: opt,
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = await getDb();
    // the customer comes from the quote / enquiry when there is one, so tasks show up on their history
    let customerId = data.customerId ?? null;
    if (data.quoteId) {
      const [q] = await db
        .select({ c: quotes.customer_id })
        .from(quotes)
        .where(eq(quotes.id, data.quoteId));
      if (!q) throw new Error("Quote not found");
      customerId = q.c;
    } else if (data.enquiryId) {
      const [e] = await db
        .select({ c: enquiries.customer_id })
        .from(enquiries)
        .where(eq(enquiries.id, data.enquiryId));
      if (!e) throw new Error("Enquiry not found");
      customerId = e.c;
    }
    await db.insert(activities).values({
      quote_id: data.quoteId ?? null,
      enquiry_id: data.enquiryId ?? null,
      customer_id: customerId,
      kind: data.kind,
      text: data.text ?? null,
      due_date: data.dueDate,
      created_by: context.user,
    });
    return { ok: true };
  });

export const setActivityDone = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ id: z.string(), done: z.boolean() }))
  .handler(async ({ data }) => {
    await (
      await getDb()
    )
      .update(activities)
      .set({ done: data.done ? 1 : 0 })
      .where(eq(activities.id, data.id));
    return { ok: true };
  });

// Open follow-ups across all deals (due date ascending), for the dashboard and pipeline cards.
export const listFollowUps = createServerFn({ method: "GET" })
  .middleware([authed])
  .handler(async () => {
    const db = await getDb();
    return db
      .select({
        a: activities,
        quote_no: quotes.quote_no,
        enquiry: enquiries.title,
        customer: customers.name,
        phone: customers.phone,
      })
      .from(activities)
      .leftJoin(quotes, eq(quotes.id, activities.quote_id))
      .leftJoin(enquiries, eq(enquiries.id, activities.enquiry_id))
      .leftJoin(customers, eq(customers.id, activities.customer_id))
      .where(and(eq(activities.done, 0), sql`${activities.due_date} is not null`))
      .orderBy(asc(activities.due_date))
      .limit(200);
  });

export const deleteQuote = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    const [inv] = await db
      .select({ no: invoices.invoice_no })
      .from(invoices)
      .where(eq(invoices.quote_id, data.id));
    if (inv)
      throw new Error(`Tax invoice ${inv.no} was issued from this quote; it can't be deleted.`);
    await db.batch([
      db.delete(quote_items).where(eq(quote_items.quote_id, data.id)),
      db.delete(quote_audit).where(eq(quote_audit.quote_id, data.id)),
      db.delete(quotes).where(eq(quotes.id, data.id)),
    ]);
    return { ok: true };
  });

// ---------- users & roles ----------
export const whoami = createServerFn({ method: "GET" })
  .middleware([authed])
  .handler(async ({ context }) => ({ email: context.user, role: context.role }));

export const listUsers = createServerFn({ method: "GET" })
  .middleware([adminOnly])
  .handler(async () => (await getDb()).select().from(users).orderBy(asc(users.email)));

export const saveUser = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .validator(
    z.object({
      email: z.string().trim().toLowerCase().email(),
      name: opt,
      role: z.enum(["admin", "accountant"]),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = await getDb();
    if (data.email === context.user && data.role !== "admin")
      throw new Error("You can't remove your own admin role.");
    await db
      .insert(users)
      .values({ email: data.email, name: data.name ?? null, role: data.role })
      .onConflictDoUpdate({
        target: users.email,
        set: { name: data.name ?? null, role: data.role },
      });
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .validator(z.object({ email: z.string() }))
  .handler(async ({ data, context }) => {
    if (data.email === context.user) throw new Error("You can't remove yourself.");
    await (await getDb()).delete(users).where(eq(users.email, data.email));
    return { ok: true };
  });

// Every task with a due date: open ones plus those done in the last 30 days (Activities page).
export const listTasks = createServerFn({ method: "GET" })
  .middleware([authed])
  .handler(async () => {
    const db = await getDb();
    const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    return db
      .select({
        a: activities,
        quote_no: quotes.quote_no,
        enquiry: enquiries.title,
        customer: customers.name,
        phone: customers.phone,
      })
      .from(activities)
      .leftJoin(quotes, eq(quotes.id, activities.quote_id))
      .leftJoin(enquiries, eq(enquiries.id, activities.enquiry_id))
      .leftJoin(customers, eq(customers.id, activities.customer_id))
      .where(
        and(
          sql`${activities.due_date} is not null`,
          sql`(${activities.done} = 0 or ${activities.due_date} >= ${since})`,
        ),
      )
      .orderBy(asc(activities.due_date))
      .limit(500);
  });

// ---------- enquiries (deals before a quote) ----------
export const listEnquiries = createServerFn({ method: "GET" })
  .middleware([authed])
  .handler(async () =>
    (await getDb())
      .select({
        e: enquiries,
        customer: customers.name,
        phone: customers.phone,
        brand: brands.name,
      })
      .from(enquiries)
      .leftJoin(customers, eq(customers.id, enquiries.customer_id))
      .leftJoin(brands, eq(brands.id, enquiries.brand_id))
      .orderBy(desc(enquiries.created_at))
      .limit(300),
  );

export const saveEnquiry = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(
    z.object({
      id: z.string().optional(),
      title: text.min(1),
      need: opt,
      expected_value: money,
      brand_id: z.string().nullable(),
      customer_id: z.string().nullable(),
      newCustomer: z.object({ name: text.min(1), phone: opt }).nullable(),
      followUp: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .default(null),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = await getDb();
    let customerId = data.customer_id;
    if (!customerId && data.newCustomer) {
      const [c] = await db
        .insert(customers)
        .values(data.newCustomer)
        .returning({ id: customers.id });
      customerId = c?.id ?? null;
    }
    const row = {
      title: data.title,
      need: data.need ?? null,
      expected_value: data.expected_value,
      brand_id: data.brand_id,
      customer_id: customerId,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      await db.update(enquiries).set(row).where(eq(enquiries.id, data.id));
      return { id: data.id };
    }
    const id = crypto.randomUUID();
    await db.insert(enquiries).values({ ...row, id, created_by: context.user });
    if (data.followUp)
      await db.insert(activities).values({
        enquiry_id: id,
        customer_id: customerId,
        kind: "followup",
        text: `Follow up: ${data.title}`,
        due_date: data.followUp,
        created_by: context.user,
      });
    return { id };
  });

export const setEnquiryStatus = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ id: z.string(), status: z.enum(["open", "lost"]) }))
  .handler(async ({ data }) => {
    await (
      await getDb()
    )
      .update(enquiries)
      .set({ status: data.status, updated_at: new Date().toISOString() })
      .where(eq(enquiries.id, data.id));
    return { ok: true };
  });

export const deleteEnquiry = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.batch([
      db.delete(activities).where(eq(activities.enquiry_id, data.id)),
      db.delete(enquiries).where(eq(enquiries.id, data.id)),
    ]);
    return { ok: true };
  });

// ---------- contacts (people at a customer company) ----------
export const listContacts = createServerFn({ method: "GET" })
  .middleware([authed])
  .validator(z.object({ customerId: z.string().optional() }))
  .handler(async ({ data }) => {
    const db = await getDb();
    const q = db.select().from(contacts);
    return (data.customerId ? q.where(eq(contacts.customer_id, data.customerId)) : q).orderBy(
      desc(contacts.is_primary),
      asc(contacts.name),
    );
  });

export const saveContact = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(
    z.object({
      id: z.string().optional(),
      customer_id: z.string(),
      name: text.min(1),
      role: opt,
      phone: opt,
      email: opt,
      is_primary: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const db = await getDb();
    const { id, is_primary, ...rest } = data;
    const row = {
      ...rest,
      role: rest.role ?? null,
      phone: rest.phone ?? null,
      email: rest.email ?? null,
      is_primary: is_primary ? 1 : 0,
    };
    // one primary contact per company
    if (is_primary)
      await db
        .update(contacts)
        .set({ is_primary: 0 })
        .where(eq(contacts.customer_id, data.customer_id));
    if (id) await db.update(contacts).set(row).where(eq(contacts.id, id));
    else await db.insert(contacts).values(row);
    return { ok: true };
  });

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await (await getDb()).delete(contacts).where(eq(contacts.id, data.id));
    return { ok: true };
  });
