-- Tax invoices issued from a quotation. An invoice is a snapshot: later edits to the quote do not change it.
-- One invoice per quote. invoice_no is "<brand code>/<FY, e.g. 2627>/<seq>" (<= 16 chars, GST Rule 46).
create table invoices (
  id text primary key,
  invoice_no text not null unique,
  quote_id text not null unique,
  brand_id text not null,
  invoice_date text not null,
  igst integer not null default 0,
  extra_charges real not null default 0,
  notes text,
  terms text,
  buyer_name text,
  buyer_address text,
  buyer_phone text,
  buyer_gstin text,
  created_by text,
  created_at text not null
);
create table invoice_items (
  id text primary key,
  invoice_id text not null,
  position integer not null default 0,
  category text not null,
  description text not null,
  hsn text,
  unit text not null default 'm',
  qty real not null,
  weight_kg real not null default 0,
  rate_kg real not null default 0,
  unit_price real not null,
  gst_rate real not null default 18
);
create index invoice_items_invoice on invoice_items (invoice_id, position);
