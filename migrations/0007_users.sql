-- App users and roles. Cloudflare Access proves who someone is; this table decides what they may do.
-- Signed-in emails not listed here are refused.
create table users (
  email text primary key,              -- lower-case
  name text,
  role text not null check (role in ('admin','accountant')),
  created_at text not null default (datetime('now'))
);
insert into users (email, name, role) values ('sandeshsachdev27@gmail.com', 'Sandesh Sachdev', 'admin');
