-- When an asset record was last changed.
--
-- The table was created with `created_at` but never `updated_at`, so a
-- record could be changed and nothing would say when it was last touched.
-- The asset page writes it whenever a change is saved.
--
-- The existing rows are stamped with the day they were made, so nothing
-- looks as though it was touched today when it was not.

alter table assets
  add column if not exists updated_at timestamptz default now();

update assets
   set updated_at = created_at
 where updated_at is null;
