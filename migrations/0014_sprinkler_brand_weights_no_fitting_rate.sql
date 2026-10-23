-- 1. Sprinkler pipe is priced per piece: raw ₹/kg × weight + production ₹ + margin ₹, and the weight
--    belongs to a brand and a length (6 m / 12 m). Sprinkler products gain brand_id and length_m.
alter table products add column brand_id text;
alter table products add column length_m real;
update products
   set brand_id = 'tarko', length_m = 6, name = 'Sprinkler Pipe 75 mm × 6 m'
 where id = 'spr-75-3.2';

-- Sprinkler rate rows reuse the existing columns as ₹ per piece: production_kg = production,
-- margin = flat profit, transport unused. Starting values from the owner's example (100 + 80).
update rates set production_kg = 100, transport_kg = 0, margin = 80, margin_is_pct = 0
 where group_id = 'SPRINKLER';

-- 2. Fittings are bought in: no raw / production / transport / margin pricing. Prices are typed on the quote.
delete from rates where group_id = 'FITTING';
delete from brand_raw where group_id = 'FITTING';
