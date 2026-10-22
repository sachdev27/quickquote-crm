-- Tarko CRM on Cloudflare D1. Keep in sync with src/data/schema.ts.
create table brands (
  id text primary key,
  code text not null unique,           -- quote-number prefix, e.g. TRK
  name text not null,
  tagline text,                        -- e.g. "by Sakhi Industries"
  address text,
  phone text,
  gstin text,
  pan text,
  bank_name text,
  bank_account text,
  bank_ifsc text,
  upi_id text,
  terms text,
  created_at text not null default (datetime('now'))
);

create table customers (
  id text primary key,
  name text not null,
  phone text,
  address text,
  gstin text,
  notes text,
  created_at text not null default (datetime('now'))
);

-- Pricing engine. ₹/kg = raw + production + transport + margin, kept per rate group (grade) for each
-- named preset (e.g. Standard / Dealer / Project). A quote picks a preset; its rates stay editable per quote.
create table rate_groups (
  id text primary key,                 -- e.g. PE63, SPRINKLER; products point here
  name text not null,
  sort integer not null default 0
);

create table rate_presets (
  id text primary key,
  name text not null,
  sort integer not null default 0
);

create table rates (
  preset_id text not null references rate_presets(id) on delete cascade,
  group_id text not null references rate_groups(id) on delete cascade,
  raw_kg real not null default 0,
  production_kg real not null default 0,
  transport_kg real not null default 0,
  margin real not null default 0,
  margin_is_pct integer not null default 1,  -- 1 = margin % on cost, 0 = flat ₹/kg
  primary key (preset_id, group_id)
);

-- Product catalog. Price = weight × the group's ₹/kg; grades, sizes, PN and roll lengths in the
-- quote picker are all derived from these rows, so adding a product adds its chips.
create table products (
  id text primary key,
  category text not null check (category in ('pipe','sprinkler','fitting')),
  rate_group_id text not null references rate_groups(id),
  name text not null,
  grade text,                          -- PE63 / PE80 / PE100
  roll text,                           -- complete / cut
  size_mm integer,
  inch text,
  pn text,
  roll_lengths text,                   -- "300/500" metres per roll
  unit text not null default 'm' check (unit in ('m','pc','kg')),
  weight_kg real not null default 0,   -- kg per unit (per metre for pipe, per piece otherwise)
  gst_rate real not null default 18,
  hsn text,
  sort integer not null default 0,
  active integer not null default 1
);

create table quotes (
  id text primary key,
  quote_no text not null unique,
  brand_id text not null references brands(id),
  customer_id text references customers(id) on delete set null,
  quote_date text not null default (date('now')),
  preset_id text,
  status text not null default 'draft' check (status in ('draft','sent','won','lost')),
  igst integer not null default 0,     -- 1 = inter-state supply (IGST), else CGST+SGST
  extra_charges real not null default 0,
  notes text,
  created_by text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table quote_items (
  id text primary key,
  quote_id text not null references quotes(id) on delete cascade,
  position integer not null default 0,
  product_id text,
  category text not null check (category in ('pipe','sprinkler','fitting')),
  description text not null,
  hsn text,
  unit text not null default 'm',
  qty real not null,
  weight_kg real not null default 0,   -- per unit, snapshot
  rate_kg real not null default 0,     -- ₹/kg used, snapshot
  unit_price real not null,            -- ₹ per unit ex-GST (= weight × rate, or typed for custom)
  gst_rate real not null default 18
);

create index quotes_created_idx on quotes (created_at desc);
create index quotes_brand_idx on quotes (brand_id);
create index quote_items_quote_idx on quote_items (quote_id);

insert into brands (id, code, name, tagline, address, phone, terms) values
  ('tarko', 'TRK', 'Tarko', 'by Sakhi Industries', 'M.I.D.C. Industrial Area, Hingna, Nagpur-440016', 'Ashish 9850066233 · Rahul 9850066933 · Ashok 9922922137', 'Price ex-factory. Forwarding charges extra. City godown charges 1% extra.'),
  ('kartex', 'KTX', 'Kartex', 'by Sakhi Industries', 'M.I.D.C. Industrial Area, Hingna, Nagpur-440016', 'Ashish 9850066233 · Rahul 9850066933 · Ashok 9922922137', 'Price ex-factory. Forwarding charges extra. City godown charges 1% extra.');
