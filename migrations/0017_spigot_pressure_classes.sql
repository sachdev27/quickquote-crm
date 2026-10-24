-- Spigot moulded fittings, supplier sheet of 20/10/2023: elbows, tees, 4-ways and Y-ways come in two pressure
-- classes, 6 kg (PN 6) and 10 kg (PN 10), at different prices. The existing rows are the 10 kg ones (every size
-- has a 10 kg price); 6 kg exists for elbow 90° and tee from 63 mm, elbow 45° at 180 and 200 mm, 4-way and
-- Y-way 63-110 mm. Reducing tees are 10 kg only. Y-way 125 mm has no price on the sheet: hidden.
update products set name = replace(name, 'Elbow 90° ', 'Elbow 90° PN 10 '), pn = 'PN 10'
  where id like 'fit-sp-elbow-90-%' and id not like '%-pn6-%' and name not like '%PN %';
update products set name = replace(name, 'Elbow 45° ', 'Elbow 45° PN 10 '), pn = 'PN 10'
  where id like 'fit-sp-elbow-45-%' and id not like '%-pn6-%' and name not like '%PN %';
update products set name = replace(name, 'Tee ', 'Tee PN 10 '), pn = 'PN 10'
  where id like 'fit-sp-tee-%' and id not like '%-pn6-%' and name not like '%PN %';
update products set name = replace(name, '4-way ', '4-way PN 10 '), pn = 'PN 10'
  where id like 'fit-sp-4-way-%' and id not like '%-pn6-%' and name not like '%PN %';
update products set name = replace(name, 'Y-way ', 'Y-way PN 10 '), pn = 'PN 10'
  where id like 'fit-sp-y-way-%' and id not like '%-pn6-%' and name not like '%PN %';
update products set active = 0 where id = 'fit-sp-y-way-125';
update products set pn = 'PN 10' where id like 'fit-sp-reducing-tee-%';
insert or ignore into products (id, category, rate_group_id, name, grade, roll, size_mm, inch, pn, roll_lengths, unit, weight_kg, gst_rate, hsn, sort, active) values
  ('fit-sp-elbow-90-pn6-63', 'fitting', 'FITTING', 'Elbow 90° PN 6 63 mm', 'Spigot moulded', null, 63, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1240, 1),
  ('fit-sp-elbow-90-pn6-75', 'fitting', 'FITTING', 'Elbow 90° PN 6 75 mm', 'Spigot moulded', null, 75, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1241, 1),
  ('fit-sp-elbow-90-pn6-90', 'fitting', 'FITTING', 'Elbow 90° PN 6 90 mm', 'Spigot moulded', null, 90, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1242, 1),
  ('fit-sp-elbow-90-pn6-110', 'fitting', 'FITTING', 'Elbow 90° PN 6 110 mm', 'Spigot moulded', null, 110, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1243, 1),
  ('fit-sp-elbow-90-pn6-125', 'fitting', 'FITTING', 'Elbow 90° PN 6 125 mm', 'Spigot moulded', null, 125, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1244, 1),
  ('fit-sp-elbow-90-pn6-140', 'fitting', 'FITTING', 'Elbow 90° PN 6 140 mm', 'Spigot moulded', null, 140, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1245, 1),
  ('fit-sp-elbow-90-pn6-160', 'fitting', 'FITTING', 'Elbow 90° PN 6 160 mm', 'Spigot moulded', null, 160, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1246, 1),
  ('fit-sp-elbow-90-pn6-180', 'fitting', 'FITTING', 'Elbow 90° PN 6 180 mm', 'Spigot moulded', null, 180, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1247, 1),
  ('fit-sp-elbow-90-pn6-200', 'fitting', 'FITTING', 'Elbow 90° PN 6 200 mm', 'Spigot moulded', null, 200, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1248, 1),
  ('fit-sp-elbow-90-pn6-225', 'fitting', 'FITTING', 'Elbow 90° PN 6 225 mm', 'Spigot moulded', null, 225, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1249, 1),
  ('fit-sp-elbow-90-pn6-250', 'fitting', 'FITTING', 'Elbow 90° PN 6 250 mm', 'Spigot moulded', null, 250, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1250, 1),
  ('fit-sp-elbow-90-pn6-280', 'fitting', 'FITTING', 'Elbow 90° PN 6 280 mm', 'Spigot moulded', null, 280, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1251, 1),
  ('fit-sp-elbow-90-pn6-315', 'fitting', 'FITTING', 'Elbow 90° PN 6 315 mm', 'Spigot moulded', null, 315, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1252, 1),
  ('fit-sp-elbow-45-pn6-180', 'fitting', 'FITTING', 'Elbow 45° PN 6 180 mm', 'Spigot moulded', null, 180, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1260, 1),
  ('fit-sp-elbow-45-pn6-200', 'fitting', 'FITTING', 'Elbow 45° PN 6 200 mm', 'Spigot moulded', null, 200, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1261, 1),
  ('fit-sp-tee-pn6-63', 'fitting', 'FITTING', 'Tee PN 6 63 mm', 'Spigot moulded', null, 63, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1267, 1),
  ('fit-sp-tee-pn6-75', 'fitting', 'FITTING', 'Tee PN 6 75 mm', 'Spigot moulded', null, 75, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1268, 1),
  ('fit-sp-tee-pn6-90', 'fitting', 'FITTING', 'Tee PN 6 90 mm', 'Spigot moulded', null, 90, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1269, 1),
  ('fit-sp-tee-pn6-110', 'fitting', 'FITTING', 'Tee PN 6 110 mm', 'Spigot moulded', null, 110, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1270, 1),
  ('fit-sp-tee-pn6-125', 'fitting', 'FITTING', 'Tee PN 6 125 mm', 'Spigot moulded', null, 125, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1271, 1),
  ('fit-sp-tee-pn6-140', 'fitting', 'FITTING', 'Tee PN 6 140 mm', 'Spigot moulded', null, 140, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1272, 1),
  ('fit-sp-tee-pn6-160', 'fitting', 'FITTING', 'Tee PN 6 160 mm', 'Spigot moulded', null, 160, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1273, 1),
  ('fit-sp-tee-pn6-180', 'fitting', 'FITTING', 'Tee PN 6 180 mm', 'Spigot moulded', null, 180, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1274, 1),
  ('fit-sp-tee-pn6-200', 'fitting', 'FITTING', 'Tee PN 6 200 mm', 'Spigot moulded', null, 200, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1275, 1),
  ('fit-sp-tee-pn6-225', 'fitting', 'FITTING', 'Tee PN 6 225 mm', 'Spigot moulded', null, 225, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1276, 1),
  ('fit-sp-tee-pn6-250', 'fitting', 'FITTING', 'Tee PN 6 250 mm', 'Spigot moulded', null, 250, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1277, 1),
  ('fit-sp-tee-pn6-280', 'fitting', 'FITTING', 'Tee PN 6 280 mm', 'Spigot moulded', null, 280, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1278, 1),
  ('fit-sp-tee-pn6-315', 'fitting', 'FITTING', 'Tee PN 6 315 mm', 'Spigot moulded', null, 315, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1279, 1),
  ('fit-sp-4-way-pn6-63', 'fitting', 'FITTING', '4-way PN 6 63 mm', 'Spigot moulded', null, 63, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1298, 1),
  ('fit-sp-4-way-pn6-75', 'fitting', 'FITTING', '4-way PN 6 75 mm', 'Spigot moulded', null, 75, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1299, 1),
  ('fit-sp-4-way-pn6-90', 'fitting', 'FITTING', '4-way PN 6 90 mm', 'Spigot moulded', null, 90, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1300, 1),
  ('fit-sp-4-way-pn6-110', 'fitting', 'FITTING', '4-way PN 6 110 mm', 'Spigot moulded', null, 110, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1301, 1),
  ('fit-sp-y-way-pn6-63', 'fitting', 'FITTING', 'Y-way PN 6 63 mm', 'Spigot moulded', null, 63, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1302, 1),
  ('fit-sp-y-way-pn6-75', 'fitting', 'FITTING', 'Y-way PN 6 75 mm', 'Spigot moulded', null, 75, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1303, 1),
  ('fit-sp-y-way-pn6-90', 'fitting', 'FITTING', 'Y-way PN 6 90 mm', 'Spigot moulded', null, 90, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1304, 1),
  ('fit-sp-y-way-pn6-110', 'fitting', 'FITTING', 'Y-way PN 6 110 mm', 'Spigot moulded', null, 110, null, 'PN 6', null, 'pc', 0, 18, '3917 40 00', 1305, 1),
  ('fit-sp-reducing-tee-200x63', 'fitting', 'FITTING', 'Reducing tee 200 × 63 mm', 'Spigot moulded', null, 200, null, 'PN 10', null, 'pc', 0, 18, '3917 40 00', 1398, 1),
  ('fit-sp-reducing-tee-200x75', 'fitting', 'FITTING', 'Reducing tee 200 × 75 mm', 'Spigot moulded', null, 200, null, 'PN 10', null, 'pc', 0, 18, '3917 40 00', 1398, 1),
  ('fit-sp-reducing-tee-200x90', 'fitting', 'FITTING', 'Reducing tee 200 × 90 mm', 'Spigot moulded', null, 200, null, 'PN 10', null, 'pc', 0, 18, '3917 40 00', 1398, 1);
