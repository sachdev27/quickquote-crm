-- Fuller customer record for the Bill-to / Ship-to blocks on quotations and invoices.
alter table customers add column contact_person text;
alter table customers add column email text;
alter table customers add column city text;
alter table customers add column state text;
alter table customers add column pincode text;
alter table customers add column pan text;
alter table customers add column ship_to text;
