-- Product categories become data (manage them under Products > Categories) instead of a fixed list.
-- SQLite cannot drop a CHECK, so products and quote_items are rebuilt without it. Nothing else references them.
create table categories (
  id text primary key,
  label text not null,
  unit text not null default 'pc' check (unit in ('m','pc','kg')),  -- default unit for new products
  gst_rate real not null default 18,                                -- default GST for new products
  sort integer not null default 0
);
insert into categories (id, label, unit, gst_rate, sort) values
  ('pipe', 'HDPE Pipe', 'm', 18, 1),
  ('sprinkler', 'Sprinkler', 'pc', 5, 2),
  ('fitting', 'Fitting', 'pc', 18, 3),
  ('plb', 'PLB Duct Pipe', 'm', 18, 4);

create table products_new (
  id text primary key,
  category text not null,
  rate_group_id text not null references rate_groups(id),
  name text not null,
  grade text,
  roll text,
  size_mm integer,
  inch text,
  pn text,
  roll_lengths text,
  unit text not null default 'm' check (unit in ('m','pc','kg')),
  weight_kg real not null default 0,
  gst_rate real not null default 18,
  hsn text,
  sort integer not null default 0,
  active integer not null default 1,
  brand_id text,
  length_m real
);
insert into products_new (id, category, rate_group_id, name, grade, roll, size_mm, inch, pn, roll_lengths, unit, weight_kg, gst_rate, hsn, sort, active, brand_id, length_m)
  select id, category, rate_group_id, name, grade, roll, size_mm, inch, pn, roll_lengths, unit, weight_kg, gst_rate, hsn, sort, active, brand_id, length_m from products;
drop table products;
alter table products_new rename to products;

create table quote_items_new (
  id text primary key,
  quote_id text not null references quotes(id) on delete cascade,
  position integer not null default 0,
  product_id text,
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
insert into quote_items_new select id, quote_id, position, product_id, category, description, hsn, unit, qty, weight_kg, rate_kg, unit_price, gst_rate from quote_items;
drop table quote_items;
alter table quote_items_new rename to quote_items;
create index quote_items_quote_idx on quote_items (quote_id);
