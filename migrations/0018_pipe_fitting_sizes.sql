-- HDPE pipe fittings sheet, re-read row by row: end cap runs 20-400 mm (no 450), tail piece 32-315 mm,
-- tail piece with flange 63-200 mm. The first read slipped a row on these columns.
update products set active = 0
  where id in ('fit-pf-end-cap-450', 'fit-pf-tail-piece-with-flange-225',
               'fit-pf-tail-piece-with-flange-250', 'fit-pf-tail-piece-with-flange-280');
insert or ignore into products (id, category, rate_group_id, name, grade, roll, size_mm, inch, pn, roll_lengths, unit, weight_kg, gst_rate, hsn, sort, active) values
  ('fit-pf-tail-piece-315', 'fitting', 'FITTING', 'Tail piece 315 mm', 'Pipe fitting', null, 315, null, null, null, 'pc', 0, 18, '3917 40 00', 1511, 1),
  ('fit-pf-tail-piece-with-flange-63', 'fitting', 'FITTING', 'Tail piece with flange 63 mm', 'Pipe fitting', null, 63, null, null, null, 'pc', 0, 18, '3917 40 00', 1512, 1);
-- re-enable if an earlier run had hidden them
update products set active = 1 where id in ('fit-pf-tail-piece-315', 'fit-pf-tail-piece-with-flange-63');
