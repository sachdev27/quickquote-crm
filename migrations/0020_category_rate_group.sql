-- Each category points at the rate group (pricing card) its new products use. Categories you add get their own
-- group; PLB duct pipe gets one now, with a zeroed rate row for every profile x preset.
alter table categories add column rate_group_id text;
update categories set rate_group_id = 'PE63' where id = 'pipe';
update categories set rate_group_id = 'SPRINKLER' where id = 'sprinkler';
update categories set rate_group_id = 'FITTING' where id = 'fitting';
insert or ignore into rate_groups (id, name, sort) values ('PLB', 'PLB Duct Pipe', 100);
insert or ignore into rates (profile_id, preset_id, group_id)
  select p.id, s.id, 'PLB' from rate_profiles p, rate_presets s;
update categories set rate_group_id = 'PLB' where id = 'plb';
