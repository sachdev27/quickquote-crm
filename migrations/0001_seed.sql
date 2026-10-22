-- Sample pricing presets (edit in the app). "Standard" is back-solved from the Sakhi sheet w.e.f. 01/10/2026,
-- which works out to ~₹135–140/kg ex-GST for HDPE pipe at IS 4984 weights and ~₹128/kg for sprinkler pipe.
insert into rate_groups (id, name, sort) values
  ('PE63', 'HDPE PE63', 1), ('PE80', 'HDPE PE80', 2), ('PE100', 'HDPE PE100', 3), ('SPRINKLER', 'Sprinkler pipe', 4), ('FITTING', 'Fittings', 5);

insert into rate_presets (id, name, sort) values ('standard', 'Standard', 1), ('dealer', 'Dealer', 2), ('project', 'Project', 3);

insert into rates (preset_id, group_id, raw_kg, production_kg, transport_kg, margin, margin_is_pct)
select p.id, g.id, g.raw, g.prod, 2, p.margin, 1
from (select 'standard' id, 12 margin union all select 'dealer', 8 union all select 'project', 5) p
cross join (select 'PE63' id, 105 raw, 15 prod union all select 'PE80', 110, 15 union all select 'PE100', 115, 15
            union all select 'SPRINKLER', 100, 12 union all select 'FITTING', 110, 25) g;

-- Products Sakhi makes. Pipe weights (kg/m) are computed from IS 4984:2016 SDR for each grade and PN
-- (min wall OD/SDR rounded up to 0.1 mm, min 2 mm, density 0.95); edit them to match your weight chart.
insert into products (id, category, rate_group_id, name, grade, roll, size_mm, inch, pn, roll_lengths, unit, weight_kg, gst_rate, hsn, sort) values
  ('pe63-25-pn6','pipe','PE63','HDPE Pipe PE63 25 mm (3/4") PN 6','PE63','complete',25,'3/4"','PN 6','500','m',0.137,18,'3917 21 90',1),
  ('pe63-32-pn6','pipe','PE63','HDPE Pipe PE63 32 mm (1") PN 6','PE63','complete',32,'1"','PN 6','300/500','m',0.212,18,'3917 21 90',2),
  ('pe63-32-pn8','pipe','PE63','HDPE Pipe PE63 32 mm (1") PN 8','PE63','complete',32,'1"','PN 8','300/500','m',0.26,18,'3917 21 90',3),
  ('pe63-40-pn4','pipe','PE63','HDPE Pipe PE63 40 mm (1.25") PN 4','PE63','complete',40,'1.25"','PN 4','300','m',0.227,18,'3917 21 90',4),
  ('pe63-40-pn6','pipe','PE63','HDPE Pipe PE63 40 mm (1.25") PN 6','PE63','complete',40,'1.25"','PN 6','300','m',0.331,18,'3917 21 90',5),
  ('pe63-40-pn8','pipe','PE63','HDPE Pipe PE63 40 mm (1.25") PN 8','PE63','complete',40,'1.25"','PN 8','300','m',0.401,18,'3917 21 90',6),
  ('pe63-50-pn4','pipe','PE63','HDPE Pipe PE63 50 mm (1.5") PN 4','PE63','complete',50,'1.5"','PN 4','300/500','m',0.341,18,'3917 21 90',7),
  ('pe63-50-pn6','pipe','PE63','HDPE Pipe PE63 50 mm (1.5") PN 6','PE63','complete',50,'1.5"','PN 6','300/500','m',0.511,18,'3917 21 90',8),
  ('pe63-50-pn8','pipe','PE63','HDPE Pipe PE63 50 mm (1.5") PN 8','PE63','complete',50,'1.5"','PN 8','300/500','m',0.623,18,'3917 21 90',9),
  ('pe63-63-pn4','pipe','PE63','HDPE Pipe PE63 63 mm (2") PN 4','PE63','complete',63,'2"','PN 4','200/300','m',0.537,18,'3917 21 90',10),
  ('pe63-63-pn6','pipe','PE63','HDPE Pipe PE63 63 mm (2") PN 6','PE63','complete',63,'2"','PN 6','200/300','m',0.818,18,'3917 21 90',11),
  ('pe63-63-pn8','pipe','PE63','HDPE Pipe PE63 63 mm (2") PN 8','PE63','complete',63,'2"','PN 8','200/300','m',0.99,18,'3917 21 90',12),
  ('pe63-75-pn4','pipe','PE63','HDPE Pipe PE63 75 mm (2.5") PN 4','PE63','complete',75,'2.5"','PN 4','100','m',0.767,18,'3917 21 90',13),
  ('pe63-75-pn6','pipe','PE63','HDPE Pipe PE63 75 mm (2.5") PN 6','PE63','complete',75,'2.5"','PN 6','100','m',1.16,18,'3917 21 90',14),
  ('pe63-75-pn8','pipe','PE63','HDPE Pipe PE63 75 mm (2.5") PN 8','PE63','complete',75,'2.5"','PN 8','100','m',1.402,18,'3917 21 90',15),
  ('pe63-90-pn4','pipe','PE63','HDPE Pipe PE63 90 mm (3") PN 4','PE63','complete',90,'3"','PN 4','100','m',1.1,18,'3917 21 90',16),
  ('pe63-90-pn6','pipe','PE63','HDPE Pipe PE63 90 mm (3") PN 6','PE63','complete',90,'3"','PN 6','100','m',1.666,18,'3917 21 90',17),
  ('pe63-90-pn8','pipe','PE63','HDPE Pipe PE63 90 mm (3") PN 8','PE63','complete',90,'3"','PN 8','100','m',2.002,18,'3917 21 90',18),
  ('pe63-110-pn4','pipe','PE63','HDPE Pipe PE63 110 mm (4") PN 4','PE63','complete',110,'4"','PN 4','60/100','m',1.656,18,'3917 21 90',19),
  ('pe63-110-pn6','pipe','PE63','HDPE Pipe PE63 110 mm (4") PN 6','PE63','complete',110,'4"','PN 6','60/100','m',2.463,18,'3917 21 90',20),
  ('pe63-110-pn8','pipe','PE63','HDPE Pipe PE63 110 mm (4") PN 8','PE63','complete',110,'4"','PN 8','60/100','m',2.985,18,'3917 21 90',21),
  ('pe80-25-pn8','pipe','PE80','HDPE Pipe PE80 25 mm (3/4") PN 8','PE80','complete',25,'3/4"','PN 8','500','m',0.137,18,'3917 21 90',22),
  ('pe80-32-pn8','pipe','PE80','HDPE Pipe PE80 32 mm (1") PN 8','PE80','complete',32,'1"','PN 8','300/500','m',0.212,18,'3917 21 90',23),
  ('pe80-32-pn10','pipe','PE80','HDPE Pipe PE80 32 mm (1") PN 10','PE80','complete',32,'1"','PN 10','300/500','m',0.26,18,'3917 21 90',24),
  ('pe80-40-pn6','pipe','PE80','HDPE Pipe PE80 40 mm (1.25") PN 6','PE80','complete',40,'1.25"','PN 6','300','m',0.269,18,'3917 21 90',25),
  ('pe80-40-pn8','pipe','PE80','HDPE Pipe PE80 40 mm (1.25") PN 8','PE80','complete',40,'1.25"','PN 8','300','m',0.331,18,'3917 21 90',26),
  ('pe80-40-pn10','pipe','PE80','HDPE Pipe PE80 40 mm (1.25") PN 10','PE80','complete',40,'1.25"','PN 10','300','m',0.401,18,'3917 21 90',27),
  ('pe80-50-pn6','pipe','PE80','HDPE Pipe PE80 50 mm (1.5") PN 6','PE80','complete',50,'1.5"','PN 6','300/500','m',0.421,18,'3917 21 90',28),
  ('pe80-50-pn8','pipe','PE80','HDPE Pipe PE80 50 mm (1.5") PN 8','PE80','complete',50,'1.5"','PN 8','300/500','m',0.511,18,'3917 21 90',29),
  ('pe80-50-pn10','pipe','PE80','HDPE Pipe PE80 50 mm (1.5") PN 10','PE80','complete',50,'1.5"','PN 10','300/500','m',0.623,18,'3917 21 90',30),
  ('pe80-63-pn6','pipe','PE80','HDPE Pipe PE80 63 mm (2") PN 6','PE80','complete',63,'2"','PN 6','200/300','m',0.671,18,'3917 21 90',31),
  ('pe80-63-pn8','pipe','PE80','HDPE Pipe PE80 63 mm (2") PN 8','PE80','complete',63,'2"','PN 8','200/300','m',0.818,18,'3917 21 90',32),
  ('pe80-63-pn10','pipe','PE80','HDPE Pipe PE80 63 mm (2") PN 10','PE80','complete',63,'2"','PN 10','200/300','m',0.99,18,'3917 21 90',33),
  ('pe80-75-pn6','pipe','PE80','HDPE Pipe PE80 75 mm (2.5") PN 6','PE80','complete',75,'2.5"','PN 6','100','m',0.947,18,'3917 21 90',34),
  ('pe80-75-pn8','pipe','PE80','HDPE Pipe PE80 75 mm (2.5") PN 8','PE80','complete',75,'2.5"','PN 8','100','m',1.16,18,'3917 21 90',35),
  ('pe80-75-pn10','pipe','PE80','HDPE Pipe PE80 75 mm (2.5") PN 10','PE80','complete',75,'2.5"','PN 10','100','m',1.402,18,'3917 21 90',36),
  ('pe80-90-pn6','pipe','PE80','HDPE Pipe PE80 90 mm (3") PN 6','PE80','complete',90,'3"','PN 6','100','m',1.34,18,'3917 21 90',37),
  ('pe80-90-pn8','pipe','PE80','HDPE Pipe PE80 90 mm (3") PN 8','PE80','complete',90,'3"','PN 8','100','m',1.666,18,'3917 21 90',38),
  ('pe80-90-pn10','pipe','PE80','HDPE Pipe PE80 90 mm (3") PN 10','PE80','complete',90,'3"','PN 10','100','m',2.002,18,'3917 21 90',39),
  ('pe80-110-pn6','pipe','PE80','HDPE Pipe PE80 110 mm (4") PN 6','PE80','complete',110,'4"','PN 6','60/100','m',2.008,18,'3917 21 90',40),
  ('pe80-110-pn8','pipe','PE80','HDPE Pipe PE80 110 mm (4") PN 8','PE80','complete',110,'4"','PN 8','60/100','m',2.463,18,'3917 21 90',41),
  ('pe80-110-pn10','pipe','PE80','HDPE Pipe PE80 110 mm (4") PN 10','PE80','complete',110,'4"','PN 10','60/100','m',2.985,18,'3917 21 90',42),
  ('pe100-75-pn6','pipe','PE100','HDPE Pipe PE100 75 mm (2.5") PN 6','PE100','complete',75,'2.5"','PN 6','100','m',0.767,18,'3917 21 90',43),
  ('pe100-75-pn8','pipe','PE100','HDPE Pipe PE100 75 mm (2.5") PN 8','PE100','complete',75,'2.5"','PN 8','100','m',0.947,18,'3917 21 90',44),
  ('pe100-75-pn10','pipe','PE100','HDPE Pipe PE100 75 mm (2.5") PN 10','PE100','complete',75,'2.5"','PN 10','100','m',1.16,18,'3917 21 90',45),
  ('pe100-90-pn6','pipe','PE100','HDPE Pipe PE100 90 mm (3") PN 6','PE100','complete',90,'3"','PN 6','100','m',1.1,18,'3917 21 90',46),
  ('pe100-90-pn8','pipe','PE100','HDPE Pipe PE100 90 mm (3") PN 8','PE100','complete',90,'3"','PN 8','100','m',1.34,18,'3917 21 90',47),
  ('pe100-90-pn10','pipe','PE100','HDPE Pipe PE100 90 mm (3") PN 10','PE100','complete',90,'3"','PN 10','100','m',1.666,18,'3917 21 90',48),
  ('pe100-110-pn6','pipe','PE100','HDPE Pipe PE100 110 mm (4") PN 6','PE100','complete',110,'4"','PN 6','60/100','m',1.656,18,'3917 21 90',49),
  ('pe100-110-pn8','pipe','PE100','HDPE Pipe PE100 110 mm (4") PN 8','PE100','complete',110,'4"','PN 8','60/100','m',2.008,18,'3917 21 90',50),
  ('pe100-110-pn10','pipe','PE100','HDPE Pipe PE100 110 mm (4") PN 10','PE100','complete',110,'4"','PN 10','60/100','m',2.463,18,'3917 21 90',51),
  ('pe63-cut-32-pn6','pipe','PE63','HDPE Pipe PE63 32 mm (1") PN 6 · cut roll','PE63','cut',32,'1"','PN 6',null,'m',0.212,18,'3917 21 90',52),
  ('pe63-cut-40-pn6','pipe','PE63','HDPE Pipe PE63 40 mm (1.25") PN 6 · cut roll','PE63','cut',40,'1.25"','PN 6',null,'m',0.331,18,'3917 21 90',53),
  ('pe63-cut-50-pn6','pipe','PE63','HDPE Pipe PE63 50 mm (1.5") PN 6 · cut roll','PE63','cut',50,'1.5"','PN 6',null,'m',0.511,18,'3917 21 90',54),
  ('pe63-cut-63-pn4','pipe','PE63','HDPE Pipe PE63 63 mm (2") PN 4 · cut roll','PE63','cut',63,'2"','PN 4',null,'m',0.537,18,'3917 21 90',55),
  ('pe63-cut-63-pn6','pipe','PE63','HDPE Pipe PE63 63 mm (2") PN 6 · cut roll','PE63','cut',63,'2"','PN 6',null,'m',0.818,18,'3917 21 90',56),
  ('pe63-cut-75-pn4','pipe','PE63','HDPE Pipe PE63 75 mm (2.5") PN 4 · cut roll','PE63','cut',75,'2.5"','PN 4',null,'m',0.767,18,'3917 21 90',57),
  ('pe63-cut-75-pn6','pipe','PE63','HDPE Pipe PE63 75 mm (2.5") PN 6 · cut roll','PE63','cut',75,'2.5"','PN 6',null,'m',1.16,18,'3917 21 90',58),
  ('spr-spjain-c','sprinkler','SPRINKLER','"SP Jain" Sprinkler Pipe 75 mm × 3.2 kg "C" Type',null,null,75,null,null,null,'pc',3.2,5,'3917 21 90',59),
  ('spr-tarko-l','sprinkler','SPRINKLER','"Tarko" Sprinkler Pipe 75 mm × 3.2 kg "L" Type',null,null,75,null,null,null,'pc',3.2,5,'3917 21 90',60),
  ('spr-tarko-c','sprinkler','SPRINKLER','"Tarko" Sprinkler Pipe 75 mm × 3.2 kg "C" Type',null,null,75,null,null,null,'pc',3.2,5,'3917 21 90',61),
  ('spr-aquaway-l','sprinkler','SPRINKLER','"Aquaway" Sprinkler Pipe 75 mm × 3.2 kg "L" Type',null,null,75,null,null,null,'pc',3.2,5,'3917 21 90',62),
  ('spr-aquaway-c','sprinkler','SPRINKLER','"Aquaway" Sprinkler Pipe 75 mm × 3.2 kg "C" Type',null,null,75,null,null,null,'pc',3.2,5,'3917 21 90',63);
