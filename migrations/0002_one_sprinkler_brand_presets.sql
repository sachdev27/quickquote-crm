-- Sprinkler pipe is one product (75 mm × 3.2 kg); SP Jain / Tarko / Aquaway are brands, not products.
alter table brands add column default_preset_id text;  -- picking the brand on a quote selects this pricing preset

insert or ignore into brands (id, code, name, tagline, address, phone, terms)
select 'aquaway', 'AQW', 'Aquaway', tagline, address, phone, terms from brands where id = 'tarko';
insert or ignore into brands (id, code, name, tagline, address, phone, terms)
select 'spjain', 'SPJ', 'SP Jain', tagline, address, phone, terms from brands where id = 'tarko';

update products set active = 0 where category = 'sprinkler' and id like 'spr-%';
insert or ignore into products (id, category, rate_group_id, name, size_mm, unit, weight_kg, gst_rate, hsn, sort)
values ('spr-75-3.2', 'sprinkler', 'SPRINKLER', 'Sprinkler Pipe 75 mm × 3.2 kg', 75, 'pc', 3.2, 5, '3917 21 90', 60);
