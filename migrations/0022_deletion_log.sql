-- Permanent record of deleted quotations and tax invoices (who, when, what). Survives the deletion itself.
create table deletion_log (
  id integer primary key autoincrement,
  at text not null,
  by text,
  kind text not null check (kind in ('quote','invoice')),
  ref_no text not null,
  party text,
  detail text
);
create index deletion_log_at on deletion_log (at desc);
