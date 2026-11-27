-- The assets register, tied to the tables that describe it.
--
-- The elaborate assets page is coming back, and it needs three things the
-- books already have but the assets table was not using:
--
--   asset_categories   Kitchen Equipment, Furniture, Uniform, Electronics
--   asset_types        Chiller, Freezer, Table, Staff Uniform (each under a category)
--   asset_locations    Kitchen, Restaurant, Office, Sales Counter, Storage
--
-- An asset number is made from the category's prefix and the type's prefix —
-- "KICH00001" is Kitchen Equipment + Chiller, number 1. The prefixes are
-- seeded to the two-letter form the books already use, and the category's is
-- the first two letters of its name.
--
-- While here, four tables were left without row-level security at all:
-- asset_categories, asset_types, asset_locations and asset_audit_log. With
-- the public key in the browser, that meant anyone could read them and write
-- to them. They are now locked the same way the compliance register is:
-- everyone signed in may read; an administrator, or someone holding
-- `manage_settings`, may write.
--
-- The `assets` table had row-level security switched on but **no policies at
-- all**, so even a signed-in user could not read or change an asset through
-- the browser — the only way in was the server, with the service key. It now
-- has the same two policies as the register.

-- ---------------------------------------------------------------------------
-- The links
-- ---------------------------------------------------------------------------

alter table assets
  add column if not exists category_id bigint references asset_categories(id) on delete set null;

alter table assets
  add column if not exists type_id bigint references asset_types(id) on delete set null;

alter table assets
  add column if not exists location_id bigint references asset_locations(id) on delete set null;

create index if not exists assets_category_idx on assets (category_id);
create index if not exists assets_type_idx on assets (type_id);
create index if not exists assets_location_idx on assets (location_id);
create index if not exists assets_status_idx on assets (status);

-- The two rows that are on the books are a Kitchen Equipment chiller in the
-- Kitchen. They are linked so they group and filter correctly.
update assets a
   set category_id = (select id from asset_categories where name = 'Kitchen Equipment'),
       type_id     = (select id from asset_types where name = 'Chiller'),
       location_id = (select id from asset_locations where name = 'Kitchen')
 where a.asset_number in ('KICH00001', 'KICH00002');

-- ---------------------------------------------------------------------------
-- The prefixes
-- ---------------------------------------------------------------------------
-- The category's prefix is the first two letters of its name, which is the
-- form the books already use: Kitchen Equipment is "KI", so a chiller in it
-- is KICH00001. The type keeps its own prefix, because "Staff Uniform" reads
-- better as SU than as ST.

update asset_categories
   set prefix = upper(left(regexp_replace(name, '[^A-Za-z]', '', 'g'), 2))
 where prefix is distinct from upper(left(regexp_replace(name, '[^A-Za-z]', '', 'g'), 2));

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table asset_categories enable row level security;
alter table asset_types enable row level security;
alter table asset_locations enable row level security;
alter table asset_audit_log enable row level security;

-- Read: everyone signed in.
drop policy if exists "asset_categories_select" on asset_categories;
create policy "asset_categories_select" on asset_categories
  for select using (auth.role() = 'authenticated');

drop policy if exists "asset_types_select" on asset_types;
create policy "asset_types_select" on asset_types
  for select using (auth.role() = 'authenticated');

drop policy if exists "asset_locations_select" on asset_locations;
create policy "asset_locations_select" on asset_locations
  for select using (auth.role() = 'authenticated');

drop policy if exists "asset_audit_log_select" on asset_audit_log;
create policy "asset_audit_log_select" on asset_audit_log
  for select using (auth.role() = 'authenticated');

-- Write: the people who run the place.
drop policy if exists "asset_categories_write" on asset_categories;
create policy "asset_categories_write" on asset_categories
  for all
  using (is_admin() or has_permission('manage_settings'))
  with check (is_admin() or has_permission('manage_settings'));

drop policy if exists "asset_types_write" on asset_types;
create policy "asset_types_write" on asset_types
  for all
  using (is_admin() or has_permission('manage_settings'))
  with check (is_admin() or has_permission('manage_settings'));

drop policy if exists "asset_locations_write" on asset_locations;
create policy "asset_locations_write" on asset_locations
  for all
  using (is_admin() or has_permission('manage_settings'))
  with check (is_admin() or has_permission('manage_settings'));

drop policy if exists "asset_audit_log_write" on asset_audit_log;
create policy "asset_audit_log_write" on asset_audit_log
  for all
  using (is_admin() or has_permission('manage_settings'))
  with check (is_admin() or has_permission('manage_settings'));

-- The assets table itself had security switched on with no policies, so
-- nobody could read it through the browser — only the server could.
drop policy if exists "assets_select" on assets;
create policy "assets_select" on assets
  for select using (auth.role() = 'authenticated');

drop policy if exists "assets_write" on assets;
create policy "assets_write" on assets
  for all
  using (is_admin() or has_permission('manage_settings'))
  with check (is_admin() or has_permission('manage_settings'));

-- The change history of an asset.
create index if not exists asset_audit_log_asset_idx on asset_audit_log (asset_id);
