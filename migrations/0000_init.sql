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

-- Product catalog. Prices live in price lists, so one catalog serves every list.
create table products (
  id text primary key,
  category text not null check (category in ('pipe','sprinkler','fitting')),
  name text not null,
  grade text,                          -- PE63 / PE80 / PE100
  roll text,                           -- complete / cut
  size_mm integer,
  inch text,
  pn text,
  roll_lengths text,                   -- "300/500" metres per roll
  unit text not null default 'm' check (unit in ('m','pc','kg')),
  gst_rate real not null default 18,
  hsn text,
  sort integer not null default 0,
  active integer not null default 1
);

-- Several price lists (dealer, retail, project, by date...). Quotes pre-fill from the chosen one.
create table price_lists (
  id text primary key,
  name text not null,
  wef text,                            -- with effect from (date)
  prices_include_gst integer not null default 1,
  created_at text not null default (datetime('now'))
);

create table prices (
  price_list_id text not null references price_lists(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  price real not null,
  primary key (price_list_id, product_id)
);

create table quotes (
  id text primary key,
  quote_no text not null unique,
  brand_id text not null references brands(id),
  customer_id text references customers(id) on delete set null,
  quote_date text not null default (date('now')),
  price_list_id text references price_lists(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','sent','won','lost')),
  prices_include_gst integer not null default 1,
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
  unit_price real not null,
  gst_rate real not null default 18
);

create index quotes_created_idx on quotes (created_at desc);
create index quotes_brand_idx on quotes (brand_id);
create index quote_items_quote_idx on quote_items (quote_id);

insert into brands (id, code, name, tagline, address, phone, terms) values
  ('tarko', 'TRK', 'Tarko', 'by Sakhi Industries', 'M.I.D.C. Industrial Area, Hingna, Nagpur-440016', 'Ashish 9850066233 · Rahul 9850066933 · Ashok 9922922137', 'Price ex-factory. Forwarding charges extra. City godown charges 1% extra.'),
  ('kartex', 'KTX', 'Kartex', 'by Sakhi Industries', 'M.I.D.C. Industrial Area, Hingna, Nagpur-440016', 'Ashish 9850066233 · Rahul 9850066933 · Ashok 9922922137', 'Price ex-factory. Forwarding charges extra. City godown charges 1% extra.');
