-- Pipeline stage per quote (deal). quotes.status keeps its old CHECK, so the new "negotiation" stage lives in
-- its own column; status is kept in sync (negotiation counts as sent).
alter table quotes add column stage text not null default 'draft';
update quotes set stage = status;

-- Activity log + follow-ups. A row with due_date and done = 0 is an open follow-up.
create table activities (
  id text primary key,
  quote_id text references quotes(id) on delete cascade,
  customer_id text references customers(id) on delete set null,
  kind text not null check (kind in ('call','visit','whatsapp','email','note','followup')),
  text text,
  due_date text,
  done integer not null default 0,
  created_by text,
  created_at text not null default (datetime('now'))
);
create index activities_quote_idx on activities (quote_id, created_at desc);
create index activities_due_idx on activities (done, due_date);
