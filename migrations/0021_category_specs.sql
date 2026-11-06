-- Custom specifications: a category lists extra fields (comma separated, e.g. "Colour, Wall thickness (mm)");
-- each product of it stores the values as JSON in products.specs and they print on the quote line.
alter table categories add column spec_fields text;
alter table products add column specs text;
update categories set spec_fields = 'Colour, Wall thickness (mm), Coil length (m)' where id = 'plb';
