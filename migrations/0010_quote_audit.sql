-- Change history for quotes: one short row per save (what changed, when, by whom). No snapshots.
create table quote_audit (
  id integer primary key autoincrement,
  quote_id text not null,
  at text not null,
  by text,
  what text not null
);
create index quote_audit_quote on quote_audit (quote_id, at);
