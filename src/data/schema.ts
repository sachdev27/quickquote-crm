import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Column keys are snake_case on purpose: rows go to the UI as-is. Mirrors migrations/0000_init.sql.
const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const now = () => text("created_at").notNull().$defaultFn(() => new Date().toISOString());

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
  created_at: now(),
});

export const customers = sqliteTable("customers", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  gstin: text("gstin"),
  notes: text("notes"),
  created_at: now(),
});

export const products = sqliteTable("products", {
  id: id(),
  category: text("category").notNull(),
  name: text("name").notNull(),
  grade: text("grade"),
  roll: text("roll"),
  size_mm: integer("size_mm"),
  inch: text("inch"),
  pn: text("pn"),
  roll_lengths: text("roll_lengths"),
  unit: text("unit").notNull().default("m"),
  gst_rate: real("gst_rate").notNull().default(18),
  hsn: text("hsn"),
  sort: integer("sort").notNull().default(0),
  active: integer("active").notNull().default(1),
});

export const price_lists = sqliteTable("price_lists", {
  id: id(),
  name: text("name").notNull(),
  wef: text("wef"),
  prices_include_gst: integer("prices_include_gst").notNull().default(1),
  created_at: now(),
});

export const prices = sqliteTable(
  "prices",
  {
    price_list_id: text("price_list_id").notNull(),
    product_id: text("product_id").notNull(),
    price: real("price").notNull(),
  },
  (t) => [primaryKey({ columns: [t.price_list_id, t.product_id] })]
);

export const quotes = sqliteTable("quotes", {
  id: id(),
  quote_no: text("quote_no").notNull().unique(),
  brand_id: text("brand_id").notNull(),
  customer_id: text("customer_id"),
  price_list_id: text("price_list_id"),
  quote_date: text("quote_date").notNull(),
  status: text("status").notNull().default("draft"),
  prices_include_gst: integer("prices_include_gst").notNull().default(1),
  igst: integer("igst").notNull().default(0),
  extra_charges: real("extra_charges").notNull().default(0),
  notes: text("notes"),
  created_by: text("created_by"),
  created_at: now(),
  updated_at: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
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
  unit_price: real("unit_price").notNull(),
  gst_rate: real("gst_rate").notNull().default(18),
});
