-- Raw material ₹/kg can depend on the brand (per grade, within a profile). When set, it replaces the
-- preset's raw price on quotes / price lists for that brand; production, transport and margin still come from the preset.
create table brand_raw (
  profile_id text not null references rate_profiles(id) on delete cascade,
  brand_id text not null references brands(id) on delete cascade,
  group_id text not null references rate_groups(id) on delete cascade,
  raw_kg real not null,
  raw_kg_non_isi real,
  primary key (profile_id, brand_id, group_id)
);
