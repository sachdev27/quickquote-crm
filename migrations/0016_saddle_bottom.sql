-- Electrofusion saddles come with or without a bottom (supplier sheet, 18/10/2024): "with bottom" exists for
-- 63-110 mm pipe with 20, 25 and 32 mm outlets; 125-160 mm are without bottom only.
update products set name = replace(name, 'Saddle ', 'Saddle without bottom ')
  where id like 'fit-ef-saddle-%' and id not like 'fit-ef-saddle-wb-%' and name like 'Saddle %' and name not like 'Saddle with%';
insert or ignore into products (id, category, rate_group_id, name, grade, roll, size_mm, inch, pn, roll_lengths, unit, weight_kg, gst_rate, hsn, sort, active) values
  ('fit-ef-saddle-wb-63x20', 'fitting', 'FITTING', 'Saddle with bottom 63 × 20 mm', 'Electrofusion', null, 63, null, null, null, 'pc', 0, 18, '3917 40 00', 1086, 1),
  ('fit-ef-saddle-wb-63x25', 'fitting', 'FITTING', 'Saddle with bottom 63 × 25 mm', 'Electrofusion', null, 63, null, null, null, 'pc', 0, 18, '3917 40 00', 1087, 1),
  ('fit-ef-saddle-wb-63x32', 'fitting', 'FITTING', 'Saddle with bottom 63 × 32 mm', 'Electrofusion', null, 63, null, null, null, 'pc', 0, 18, '3917 40 00', 1088, 1),
  ('fit-ef-saddle-wb-75x20', 'fitting', 'FITTING', 'Saddle with bottom 75 × 20 mm', 'Electrofusion', null, 75, null, null, null, 'pc', 0, 18, '3917 40 00', 1089, 1),
  ('fit-ef-saddle-wb-75x25', 'fitting', 'FITTING', 'Saddle with bottom 75 × 25 mm', 'Electrofusion', null, 75, null, null, null, 'pc', 0, 18, '3917 40 00', 1090, 1),
  ('fit-ef-saddle-wb-75x32', 'fitting', 'FITTING', 'Saddle with bottom 75 × 32 mm', 'Electrofusion', null, 75, null, null, null, 'pc', 0, 18, '3917 40 00', 1091, 1),
  ('fit-ef-saddle-wb-90x20', 'fitting', 'FITTING', 'Saddle with bottom 90 × 20 mm', 'Electrofusion', null, 90, null, null, null, 'pc', 0, 18, '3917 40 00', 1092, 1),
  ('fit-ef-saddle-wb-90x25', 'fitting', 'FITTING', 'Saddle with bottom 90 × 25 mm', 'Electrofusion', null, 90, null, null, null, 'pc', 0, 18, '3917 40 00', 1093, 1),
  ('fit-ef-saddle-wb-90x32', 'fitting', 'FITTING', 'Saddle with bottom 90 × 32 mm', 'Electrofusion', null, 90, null, null, null, 'pc', 0, 18, '3917 40 00', 1094, 1),
  ('fit-ef-saddle-wb-110x20', 'fitting', 'FITTING', 'Saddle with bottom 110 × 20 mm', 'Electrofusion', null, 110, null, null, null, 'pc', 0, 18, '3917 40 00', 1095, 1),
  ('fit-ef-saddle-wb-110x25', 'fitting', 'FITTING', 'Saddle with bottom 110 × 25 mm', 'Electrofusion', null, 110, null, null, null, 'pc', 0, 18, '3917 40 00', 1096, 1),
  ('fit-ef-saddle-wb-110x32', 'fitting', 'FITTING', 'Saddle with bottom 110 × 32 mm', 'Electrofusion', null, 110, null, null, null, 'pc', 0, 18, '3917 40 00', 1097, 1);
