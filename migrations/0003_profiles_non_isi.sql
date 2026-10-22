-- Rate profiles: a full snapshot of every preset × grade value for a period (e.g. a quarter).
-- One profile is active; new quotes and the price list use it. Existing rates move into the first profile.
create table rate_profiles (
  id text primary key,
  name text not null,
  active integer not null default 0,
  sort integer not null default 0,
  created_at text not null default (datetime('now'))
);
insert into rate_profiles (id, name, active, sort) values ('q3-fy27', 'Q3 FY26-27 (Oct–Dec)', 1, 1);

-- rates gain profile_id in the key (SQLite can't alter a primary key, so rebuild) and an optional
-- non-ISI raw material price used when a quote is marked Non-ISI.
create table rates_new (
  profile_id text not null references rate_profiles(id) on delete cascade,
  preset_id text not null references rate_presets(id) on delete cascade,
  group_id text not null references rate_groups(id) on delete cascade,
  raw_kg real not null default 0,
  raw_kg_non_isi real,
  production_kg real not null default 0,
  transport_kg real not null default 0,
  margin real not null default 0,
  margin_is_pct integer not null default 1,
  primary key (profile_id, preset_id, group_id)
);
insert into rates_new (profile_id, preset_id, group_id, raw_kg, production_kg, transport_kg, margin, margin_is_pct)
select 'q3-fy27', preset_id, group_id, raw_kg, production_kg, transport_kg, margin, margin_is_pct from rates;
drop table rates;
alter table rates_new rename to rates;

alter table quotes add column profile_id text;
alter table quotes add column non_isi integer not null default 0;
