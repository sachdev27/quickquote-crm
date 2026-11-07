import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Column keys are snake_case on purpose: rows go to the UI as-is. Mirrors migrations/0000_init.sql.
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const now = () =>
  text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString());

export const brands = sqliteTable("brands", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline"),
  address: text("address"),
  phone: text("phone"),
  gstin: text("gstin"),
  pan: text("pan"),
  bank_name: text("bank_name"),
  bank_account: text("bank_account"),
  bank_ifsc: text("bank_ifsc"),
  upi_id: text("upi_id"),
  terms: text("terms"),
  default_preset_id: text("default_preset_id"),
  logo: text("logo"),
  created_at: now(),
});

export const customers = sqliteTable("customers", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  gstin: text("gstin"),
  notes: text("notes"),
  contact_person: text("contact_person"),
  email: text("email"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  pan: text("pan"),
  ship_to: text("ship_to"),
  created_at: now(),
});

export const rate_groups = sqliteTable("rate_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
});

export const rate_presets = sqliteTable("rate_presets", {
  id: id(),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
});

export const rate_profiles = sqliteTable("rate_profiles", {
  id: id(),
  name: text("name").notNull(),
  active: integer("active").notNull().default(0),
  sort: integer("sort").notNull().default(0),
  created_at: now(),
});

export const rates = sqliteTable(
  "rates",
  {
    profile_id: text("profile_id").notNull(),
    preset_id: text("preset_id").notNull(),
    group_id: text("group_id").notNull(),
    raw_kg: real("raw_kg").notNull().default(0),
    raw_kg_non_isi: real("raw_kg_non_isi"),
    production_kg: real("production_kg").notNull().default(0),
    transport_kg: real("transport_kg").notNull().default(0),
    margin: real("margin").notNull().default(0),
    margin_is_pct: integer("margin_is_pct").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.profile_id, t.preset_id, t.group_id] })],
);

export const products = sqliteTable("products", {
  id: id(),
  category: text("category").notNull(),
  rate_group_id: text("rate_group_id").notNull(),
  name: text("name").notNull(),
  grade: text("grade"),
  roll: text("roll"),
  size_mm: integer("size_mm"),
  inch: text("inch"),
  pn: text("pn"),
  roll_lengths: text("roll_lengths"),
  unit: text("unit").notNull().default("m"),
  weight_kg: real("weight_kg").notNull().default(0),
  gst_rate: real("gst_rate").notNull().default(18),
  hsn: text("hsn"),
  brand_id: text("brand_id"), // sprinkler pipe only: its weight is that brand's
  specs: text("specs"), // JSON {field: value} for the category's custom specification fields
  length_m: real("length_m"), // sprinkler pipe only: 6 or 12 m
  base_price: real("base_price"), // fixed-price subcategories: ₹ before the preset margin
  sort: integer("sort").notNull().default(0),
  active: integer("active").notNull().default(1),
});

export const brand_raw = sqliteTable(
  "brand_raw",
  {
    profile_id: text("profile_id").notNull(),
    brand_id: text("brand_id").notNull(),
    group_id: text("group_id").notNull(),
    raw_kg: real("raw_kg").notNull(),
    raw_kg_non_isi: real("raw_kg_non_isi"),
  },
  (t) => [primaryKey({ columns: [t.profile_id, t.brand_id, t.group_id] })],
);

export const terms = sqliteTable("terms", {
  id: id(),
  text: text("text").notNull(),
  default_on: integer("default_on").notNull().default(1),
  sort: integer("sort").notNull().default(0),
});

export const quotes = sqliteTable("quotes", {
  id: id(),
  quote_no: text("quote_no").notNull().unique(),
  brand_id: text("brand_id").notNull(),
  customer_id: text("customer_id"),
  preset_id: text("preset_id"),
  profile_id: text("profile_id"),
  non_isi: integer("non_isi").notNull().default(0),
  quote_date: text("quote_date").notNull(),
  status: text("status").notNull().default("draft"),
  stage: text("stage").notNull().default("draft"),
  igst: integer("igst").notNull().default(0),
  extra_charges: real("extra_charges").notNull().default(0),
  notes: text("notes"),
  terms: text("terms"),
  created_by: text("created_by"),
  created_at: now(),
  updated_at: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const quote_items = sqliteTable("quote_items", {
  id: id(),
  quote_id: text("quote_id").notNull(),
  position: integer("position").notNull().default(0),
  product_id: text("product_id"),
  category: text("category").notNull(),
  description: text("description").notNull(),
  hsn: text("hsn"),
  unit: text("unit").notNull().default("m"),
  qty: real("qty").notNull(),
  weight_kg: real("weight_kg").notNull().default(0),
  rate_kg: real("rate_kg").notNull().default(0),
  unit_price: real("unit_price").notNull(),
  gst_rate: real("gst_rate").notNull().default(18),
});

export const activities = sqliteTable("activities", {
  id: id(),
  quote_id: text("quote_id"),
  enquiry_id: text("enquiry_id"),
  customer_id: text("customer_id"),
  kind: text("kind").notNull(),
  text: text("text"),
  due_date: text("due_date"),
  done: integer("done").notNull().default(0),
  created_by: text("created_by"),
  created_at: now(),
});

export const users = sqliteTable("users", {
  email: text("email").primaryKey(),
  name: text("name"),
  role: text("role").notNull(),
  created_at: now(),
});

export const enquiries = sqliteTable("enquiries", {
  id: id(),
  customer_id: text("customer_id"),
  brand_id: text("brand_id"),
  title: text("title").notNull(),
  need: text("need"),
  expected_value: real("expected_value").notNull().default(0),
  status: text("status").notNull().default("open"),
  quote_id: text("quote_id"),
  created_by: text("created_by"),
  created_at: now(),
  updated_at: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const contacts = sqliteTable("contacts", {
  id: id(),
  customer_id: text("customer_id").notNull(),
  name: text("name").notNull(),
  role: text("role"),
  phone: text("phone"),
  email: text("email"),
  is_primary: integer("is_primary").notNull().default(0),
  created_at: now(),
});

// Change history: one short row per save (what changed, when, by whom). No snapshots.
export const quote_audit = sqliteTable("quote_audit", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  quote_id: text("quote_id").notNull(),
  at: text("at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  by: text("by"),
  what: text("what").notNull(),
});

// Who deleted which quotation / tax invoice, kept after the record is gone.
export const deletion_log = sqliteTable("deletion_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: text("at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  by: text("by"),
  kind: text("kind").notNull(), // quote | invoice
  ref_no: text("ref_no").notNull(),
  party: text("party"),
  detail: text("detail"),
});

// Tax invoice issued from a quote: a snapshot of the buyer and lines at the time of issue.
export const invoices = sqliteTable("invoices", {
  id: id(),
  invoice_no: text("invoice_no").notNull().unique(),
  quote_id: text("quote_id").notNull().unique(),
  brand_id: text("brand_id").notNull(),
  invoice_date: text("invoice_date").notNull(),
  igst: integer("igst").notNull().default(0),
  extra_charges: real("extra_charges").notNull().default(0),
  notes: text("notes"),
  terms: text("terms"),
  buyer_name: text("buyer_name"),
  buyer_address: text("buyer_address"),
  buyer_phone: text("buyer_phone"),
  buyer_gstin: text("buyer_gstin"),
  created_by: text("created_by"),
  created_at: now(),
});

export const invoice_items = sqliteTable("invoice_items", {
  id: id(),
  invoice_id: text("invoice_id").notNull(),
  position: integer("position").notNull().default(0),
  category: text("category").notNull(),
  description: text("description").notNull(),
  hsn: text("hsn"),
  unit: text("unit").notNull().default("m"),
  qty: real("qty").notNull(),
  weight_kg: real("weight_kg").notNull().default(0),
  rate_kg: real("rate_kg").notNull().default(0),
  unit_price: real("unit_price").notNull(),
  gst_rate: real("gst_rate").notNull().default(18),
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  unit: text("unit").notNull().default("pc"),
  gst_rate: real("gst_rate").notNull().default(18),
  rate_group_id: text("rate_group_id"),
  spec_fields: text("spec_fields"),
  sort: integer("sort").notNull().default(0),
  parent_id: text("parent_id"), // product_groups.id
  grades: text("grades").notNull().default(""), // comma list: PE63,PE80,PE100; empty = ungraded
  price_method: text("price_method").notNull().default("weight_rate"), // weight_rate | sprinkler_piece | fixed
  weight_method: text("weight_method").notNull().default("none"), // is4984 | matrix | brand | none
  drawing: text("drawing").notNull().default("none"), // pipe | sprinkler | fitting | dwc | none
  class_label: text("class_label").notNull().default(""), // PN, SN, ...
});

// Top of the catalog tree: HDPE, Fittings, Irrigation accessories, PVC / other plastics.
export const product_groups = sqliteTable("product_groups", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  sort: integer("sort").notNull().default(0),
});

// Editable kg/m per size x class for subcategories whose weight_method is "matrix" (DWC, ...).
// grade null = the same weight for every grade of the subcategory.
export const weight_matrix = sqliteTable("weight_matrix", {
  id: text("id").primaryKey(),
  category_id: text("category_id").notNull(),
  grade: text("grade"),
  size_mm: real("size_mm").notNull(),
  size_label: text("size_label").notNull(),
  class: text("class").notNull(),
  kg_per_m: real("kg_per_m").notNull().default(0),
  od_mm: real("od_mm"),
  id_mm: real("id_mm"),
  wall_mm: real("wall_mm"),
  sort: integer("sort").notNull().default(0),
});

// Key/value settings (default HSN/SAC and GST for fittings, ...).
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
