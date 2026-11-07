-- Catalog tree: parent groups → subcategories (categories) → grades → products.
-- Every graded subcategory gets one rate group per grade ("pipe:PE80", "plb:PE63", ...), copied from the old
-- groups so no rate is lost. Old groups (PE63/PE80/PE100/SPRINKLER/FITTING/PLB) stay as a rollback safety net.

-- 1. parent groups
create table product_groups (
  id text primary key,
  label text not null,
  sort integer not null default 0
);
insert into product_groups (id, label, sort) values
  ('hdpe', 'HDPE', 1),
  ('fittings', 'Fittings', 2),
  ('irrigation', 'Irrigation accessories', 3),
  ('pvc', 'PVC / other plastics', 4);

-- 2. subcategory settings
alter table categories add column parent_id text;
alter table categories add column grades text not null default '';
alter table categories add column price_method text not null default 'weight_rate';
alter table categories add column weight_method text not null default 'none';
alter table categories add column drawing text not null default 'none';
alter table categories add column class_label text not null default '';

insert or ignore into categories (id, label, unit, gst_rate, sort, spec_fields)
  values ('dwc', 'DWC Pipe', 'm', 18, 5, 'Colour');

update categories set parent_id = case when unit = 'm' then 'hdpe' else 'fittings' end;
update categories set parent_id = 'hdpe', grades = 'PE63,PE80,PE100', price_method = 'weight_rate',
  weight_method = 'is4984', drawing = 'pipe', class_label = 'PN' where id = 'pipe';
update categories set parent_id = 'hdpe', grades = 'PE63,PE80', price_method = 'sprinkler_piece',
  weight_method = 'brand', drawing = 'pipe', class_label = '' where id = 'sprinkler';
update categories set parent_id = 'hdpe', grades = 'PE63,PE80,PE100', price_method = 'weight_rate',
  weight_method = 'is4984', drawing = 'pipe', class_label = 'PN' where id = 'plb';
update categories set parent_id = 'hdpe', grades = 'PE80,PE100', price_method = 'weight_rate',
  weight_method = 'matrix', drawing = 'dwc', class_label = 'SN' where id = 'dwc';
update categories set parent_id = 'fittings', grades = '', price_method = 'fixed',
  weight_method = 'none', drawing = 'fitting', class_label = '' where id = 'fitting';

-- 3. fixed-price items carry a base price
alter table products add column base_price real;

-- 4. editable weight matrix (DWC and future subcategories)
create table weight_matrix (
  id text primary key,
  category_id text not null,
  grade text,
  size_mm real not null,
  size_label text not null,
  class text not null,
  kg_per_m real not null default 0,
  od_mm real,
  id_mm real,
  wall_mm real,
  sort integer not null default 0
);
create unique index weight_matrix_cell on weight_matrix (category_id, coalesce(grade, ''), size_label, class);

-- 5. one rate group per subcategory x grade
insert or ignore into rate_groups (id, name, sort) values
  ('pipe:PE63', 'HDPE Pipe PE 63', 10),
  ('pipe:PE80', 'HDPE Pipe PE 80', 11),
  ('pipe:PE100', 'HDPE Pipe PE 100', 12),
  ('sprinkler:PE63', 'Sprinkler PE 63', 20),
  ('sprinkler:PE80', 'Sprinkler PE 80', 21),
  ('plb:PE63', 'PLB Duct PE 63', 30),
  ('plb:PE80', 'PLB Duct PE 80', 31),
  ('plb:PE100', 'PLB Duct PE 100', 32),
  ('dwc:PE80', 'DWC Pipe PE 80', 40),
  ('dwc:PE100', 'DWC Pipe PE 100', 41),
  ('fitting', 'Fittings', 50);

-- 6. copy rates (and brand raw prices) from the old groups. Subcategories the owner added (one own group each,
-- e.g. TAPE for "tape") become ungraded: their group is renamed to the category id, rates copied across.
insert or ignore into rate_groups (id, name, sort)
  select id, label, 60 from categories where grades = '' and id <> 'fitting';

create table _group_map (old text, new text);
insert into _group_map values
  ('PE63', 'pipe:PE63'), ('PE80', 'pipe:PE80'), ('PE100', 'pipe:PE100'),
  ('SPRINKLER', 'sprinkler:PE63'), ('SPRINKLER', 'sprinkler:PE80'),
  ('PLB', 'plb:PE63'), ('PLB', 'plb:PE80'), ('PLB', 'plb:PE100'),
  ('FITTING', 'fitting');
insert into _group_map (old, new)
  select rate_group_id, id from categories
  where grades = '' and rate_group_id is not null and rate_group_id <> id
    and rate_group_id not in ('PE63', 'PE80', 'PE100', 'SPRINKLER', 'FITTING', 'PLB');

insert or ignore into rates (profile_id, preset_id, group_id, raw_kg, raw_kg_non_isi, production_kg,
  transport_kg, margin, margin_is_pct)
  select r.profile_id, r.preset_id, m.new, r.raw_kg, r.raw_kg_non_isi, r.production_kg, r.transport_kg,
    r.margin, r.margin_is_pct
  from rates r join _group_map m on m.old = r.group_id;

insert or ignore into brand_raw (profile_id, brand_id, group_id, raw_kg, raw_kg_non_isi)
  select b.profile_id, b.brand_id, m.new, b.raw_kg, b.raw_kg_non_isi
  from brand_raw b join _group_map m on m.old = b.group_id;

-- groups with no source rows (DWC, fittings, new ungraded ones) get a zeroed row for every profile x preset;
-- fittings: margin 0 % so the base price passes through unchanged
insert or ignore into rates (profile_id, preset_id, group_id)
  select p.id, s.id, g.id from rate_profiles p, rate_presets s, rate_groups g
  where g.id in ('dwc:PE80', 'dwc:PE100', 'fitting', 'plb:PE63', 'plb:PE80', 'plb:PE100')
    or g.id in (select id from categories where grades = '');
update rates set margin = 0, margin_is_pct = 1
  where group_id = 'fitting' and not exists (select 1 from rates o where o.group_id = 'FITTING');

-- 7. existing sprinkler products become PE 63; each gets a PE 80 twin (originals keep their ids)
update products set grade = 'PE63' where category = 'sprinkler' and coalesce(grade, '') = '';
insert into products (id, category, rate_group_id, name, grade, roll, size_mm, inch, pn, roll_lengths, unit,
  weight_kg, gst_rate, hsn, sort, active, brand_id, length_m, specs, base_price)
  select lower(hex(randomblob(16))), category, 'sprinkler:PE80', name, 'PE80', roll, size_mm, inch, pn,
    roll_lengths, unit, weight_kg, gst_rate, hsn, sort, active, brand_id, length_m, specs, base_price
  from products where category = 'sprinkler' and grade = 'PE63'
    and not exists (select 1 from products t where t.category = 'sprinkler' and t.grade = 'PE80'
      and t.name = products.name and coalesce(t.brand_id, '') = coalesce(products.brand_id, ''));

-- 8. every product of a graded subcategory gets one of its grades: its own (tidied, "pe 80" → PE80), else the
-- one its old group implies (PE80 → PE80, PLB/SPRINKLER → PE63), else the subcategory's first grade.
update products set grade = upper(replace(grade, ' ', ''))
  where category in (select id from categories where grades <> '') and grade is not null;
update products set grade = coalesce(
    (select substr(m.new, length(products.category) + 2) from _group_map m
      where m.old = products.rate_group_id and m.new like products.category || ':%'
      order by m.rowid limit 1),
    (select substr(c.grades, 1, instr(c.grades || ',', ',') - 1) from categories c
      where c.id = products.category))
  where category in (select id from categories where grades <> '')
    and (grade is null or instr(',' || (select grades from categories c where c.id = products.category) || ',',
      ',' || grade || ',') = 0);

-- ... and points at its subcategory x grade group; ungraded subcategories use their own id
update products set rate_group_id = case
  when (select grades from categories c where c.id = products.category) <> ''
    then category || ':' || grade
  else category end;

drop table _group_map;

-- 9. categories no longer carry a single rate group, except ungraded ones
update categories set rate_group_id = case when grades = '' then id else null end;
