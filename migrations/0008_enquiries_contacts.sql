-- Enquiries: deals that start before a quote exists (phone call, visit). Converting one creates a quote.
create table enquiries (
  id text primary key,
  customer_id text references customers(id) on delete set null,
  brand_id text references brands(id) on delete set null,
  title text not null,
  need text,                           -- sizes / quantities asked for
  expected_value real not null default 0,
  status text not null default 'open' check (status in ('open','converted','lost')),
  quote_id text references quotes(id) on delete set null,
  created_by text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);
create index enquiries_status_idx on enquiries (status, created_at desc);

-- Activities can hang off an enquiry, a quote, a customer, or nothing (plain task).
alter table activities add column enquiry_id text references enquiries(id) on delete cascade;

-- Customers are companies; contacts are the people there.
create table contacts (
  id text primary key,
  customer_id text not null references customers(id) on delete cascade,
  name text not null,
  role text,
  phone text,
  email text,
  is_primary integer not null default 0,
  created_at text not null default (datetime('now'))
);
create index contacts_customer_idx on contacts (customer_id);
