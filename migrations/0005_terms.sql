-- Terms & conditions library. default_on terms are pre-ticked on every new quote; each quote saves the
-- terms it was sent with (quotes.terms, one per line) so later edits don't change old quotes.
create table terms (
  id text primary key,
  text text not null,
  default_on integer not null default 1,
  sort integer not null default 0
);
insert into terms (id, text, default_on, sort) values
  ('ex-factory', 'Price ex-factory.', 1, 1),
  ('forwarding', 'Forwarding charges extra.', 1, 2),
  ('godown', 'City godown charges 1% extra.', 1, 3),
  ('validity', 'Prices valid for 7 days from quotation date.', 0, 4),
  ('delivery', 'Delivery within 7 days of order confirmation.', 0, 5);

alter table quotes add column terms text;
