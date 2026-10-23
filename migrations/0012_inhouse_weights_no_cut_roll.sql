-- 1. Cut roll is gone. Remove cut-roll products; any used on a saved quote are only switched off,
--    so those quotes still open (their lines keep their own description and price).
delete from products
 where roll = 'cut'
   and id not in (select product_id from quote_items where product_id is not null);
update products set active = 0 where roll = 'cut';

-- 2. In-house weights (kg/m) from the factory chart. IS 4984 stays available as a reference.
--    Matching products are updated; PE100 140 and 160 mm are new. Handwritten corrections on the
--    chart are used (PE100 160 mm: 3.41 / 4.40 / 5.40).
update products set weight_kg = 0.145 where category = 'pipe' and grade = 'PE63' and size_mm = 25 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.22 where category = 'pipe' and grade = 'PE63' and size_mm = 32 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.28 where category = 'pipe' and grade = 'PE63' and size_mm = 32 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.25 where category = 'pipe' and grade = 'PE63' and size_mm = 40 and pn = 'PN 4' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.34 where category = 'pipe' and grade = 'PE63' and size_mm = 40 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.41 where category = 'pipe' and grade = 'PE63' and size_mm = 40 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.36 where category = 'pipe' and grade = 'PE63' and size_mm = 50 and pn = 'PN 4' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.52 where category = 'pipe' and grade = 'PE63' and size_mm = 50 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.63 where category = 'pipe' and grade = 'PE63' and size_mm = 50 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.56 where category = 'pipe' and grade = 'PE63' and size_mm = 63 and pn = 'PN 4' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.81 where category = 'pipe' and grade = 'PE63' and size_mm = 63 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.04 where category = 'pipe' and grade = 'PE63' and size_mm = 63 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.81 where category = 'pipe' and grade = 'PE63' and size_mm = 75 and pn = 'PN 4' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.1 where category = 'pipe' and grade = 'PE63' and size_mm = 75 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.4 where category = 'pipe' and grade = 'PE63' and size_mm = 75 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.16 where category = 'pipe' and grade = 'PE63' and size_mm = 90 and pn = 'PN 4' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.7 where category = 'pipe' and grade = 'PE63' and size_mm = 90 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 2.1 where category = 'pipe' and grade = 'PE63' and size_mm = 90 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.9 where category = 'pipe' and grade = 'PE63' and size_mm = 110 and pn = 'PN 4' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 2.6 where category = 'pipe' and grade = 'PE63' and size_mm = 110 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 3.1 where category = 'pipe' and grade = 'PE63' and size_mm = 110 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.15 where category = 'pipe' and grade = 'PE80' and size_mm = 25 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.22 where category = 'pipe' and grade = 'PE80' and size_mm = 32 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.28 where category = 'pipe' and grade = 'PE80' and size_mm = 32 and pn = 'PN 10' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.28 where category = 'pipe' and grade = 'PE80' and size_mm = 40 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.35 where category = 'pipe' and grade = 'PE80' and size_mm = 40 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.42 where category = 'pipe' and grade = 'PE80' and size_mm = 40 and pn = 'PN 10' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.44 where category = 'pipe' and grade = 'PE80' and size_mm = 50 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.54 where category = 'pipe' and grade = 'PE80' and size_mm = 50 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.66 where category = 'pipe' and grade = 'PE80' and size_mm = 50 and pn = 'PN 10' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.66 where category = 'pipe' and grade = 'PE80' and size_mm = 63 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.84 where category = 'pipe' and grade = 'PE80' and size_mm = 63 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.04 where category = 'pipe' and grade = 'PE80' and size_mm = 63 and pn = 'PN 10' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.0 where category = 'pipe' and grade = 'PE80' and size_mm = 75 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.2 where category = 'pipe' and grade = 'PE80' and size_mm = 75 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.44 where category = 'pipe' and grade = 'PE80' and size_mm = 75 and pn = 'PN 10' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.36 where category = 'pipe' and grade = 'PE80' and size_mm = 90 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.7 where category = 'pipe' and grade = 'PE80' and size_mm = 90 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 2.1 where category = 'pipe' and grade = 'PE80' and size_mm = 90 and pn = 'PN 10' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 2.1 where category = 'pipe' and grade = 'PE80' and size_mm = 110 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 2.6 where category = 'pipe' and grade = 'PE80' and size_mm = 110 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 3.1 where category = 'pipe' and grade = 'PE80' and size_mm = 110 and pn = 'PN 10' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 0.81 where category = 'pipe' and grade = 'PE100' and size_mm = 75 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.0 where category = 'pipe' and grade = 'PE100' and size_mm = 75 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.22 where category = 'pipe' and grade = 'PE100' and size_mm = 75 and pn = 'PN 10' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.16 where category = 'pipe' and grade = 'PE100' and size_mm = 90 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.4 where category = 'pipe' and grade = 'PE100' and size_mm = 90 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.7 where category = 'pipe' and grade = 'PE100' and size_mm = 90 and pn = 'PN 10' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 1.9 where category = 'pipe' and grade = 'PE100' and size_mm = 110 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 2.1 where category = 'pipe' and grade = 'PE100' and size_mm = 110 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 2.6 where category = 'pipe' and grade = 'PE100' and size_mm = 110 and pn = 'PN 10' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 2.81 where category = 'pipe' and grade = 'PE100' and size_mm = 140 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 3.44 where category = 'pipe' and grade = 'PE100' and size_mm = 140 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 4.21 where category = 'pipe' and grade = 'PE100' and size_mm = 140 and pn = 'PN 10' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 3.41 where category = 'pipe' and grade = 'PE100' and size_mm = 160 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 4.4 where category = 'pipe' and grade = 'PE100' and size_mm = 160 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete';
update products set weight_kg = 5.4 where category = 'pipe' and grade = 'PE100' and size_mm = 160 and pn = 'PN 10' and coalesce(roll,'complete') = 'complete';
insert into products (id, category, rate_group_id, name, grade, roll, size_mm, inch, pn, roll_lengths, unit, weight_kg, gst_rate, hsn, sort, active)
select 'pe100-140-pn6', 'pipe', 'PE100', 'HDPE Pipe PE100 140 mm (5.5") PN 6', 'PE100', 'complete', 140, '5.5"', 'PN 6', null, 'm', 2.81, 18, '3917 21 90', 201, 1
 where not exists (select 1 from products where category = 'pipe' and grade = 'PE100' and size_mm = 140 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete');
insert into products (id, category, rate_group_id, name, grade, roll, size_mm, inch, pn, roll_lengths, unit, weight_kg, gst_rate, hsn, sort, active)
select 'pe100-140-pn8', 'pipe', 'PE100', 'HDPE Pipe PE100 140 mm (5.5") PN 8', 'PE100', 'complete', 140, '5.5"', 'PN 8', null, 'm', 3.44, 18, '3917 21 90', 202, 1
 where not exists (select 1 from products where category = 'pipe' and grade = 'PE100' and size_mm = 140 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete');
insert into products (id, category, rate_group_id, name, grade, roll, size_mm, inch, pn, roll_lengths, unit, weight_kg, gst_rate, hsn, sort, active)
select 'pe100-140-pn10', 'pipe', 'PE100', 'HDPE Pipe PE100 140 mm (5.5") PN 10', 'PE100', 'complete', 140, '5.5"', 'PN 10', null, 'm', 4.21, 18, '3917 21 90', 203, 1
 where not exists (select 1 from products where category = 'pipe' and grade = 'PE100' and size_mm = 140 and pn = 'PN 10' and coalesce(roll,'complete') = 'complete');
insert into products (id, category, rate_group_id, name, grade, roll, size_mm, inch, pn, roll_lengths, unit, weight_kg, gst_rate, hsn, sort, active)
select 'pe100-160-pn6', 'pipe', 'PE100', 'HDPE Pipe PE100 160 mm (6") PN 6', 'PE100', 'complete', 160, '6"', 'PN 6', null, 'm', 3.41, 18, '3917 21 90', 204, 1
 where not exists (select 1 from products where category = 'pipe' and grade = 'PE100' and size_mm = 160 and pn = 'PN 6' and coalesce(roll,'complete') = 'complete');
insert into products (id, category, rate_group_id, name, grade, roll, size_mm, inch, pn, roll_lengths, unit, weight_kg, gst_rate, hsn, sort, active)
select 'pe100-160-pn8', 'pipe', 'PE100', 'HDPE Pipe PE100 160 mm (6") PN 8', 'PE100', 'complete', 160, '6"', 'PN 8', null, 'm', 4.4, 18, '3917 21 90', 205, 1
 where not exists (select 1 from products where category = 'pipe' and grade = 'PE100' and size_mm = 160 and pn = 'PN 8' and coalesce(roll,'complete') = 'complete');
insert into products (id, category, rate_group_id, name, grade, roll, size_mm, inch, pn, roll_lengths, unit, weight_kg, gst_rate, hsn, sort, active)
select 'pe100-160-pn10', 'pipe', 'PE100', 'HDPE Pipe PE100 160 mm (6") PN 10', 'PE100', 'complete', 160, '6"', 'PN 10', null, 'm', 5.4, 18, '3917 21 90', 206, 1
 where not exists (select 1 from products where category = 'pipe' and grade = 'PE100' and size_mm = 160 and pn = 'PN 10' and coalesce(roll,'complete') = 'complete');

-- 3. Small key/value settings: default HSN/SAC and GST for fittings typed on a quote.
create table if not exists settings (
  key text primary key,
  value text not null
);
insert or ignore into settings (key, value) values ('fitting_hsn', '3917 40 00'), ('fitting_gst', '18');
