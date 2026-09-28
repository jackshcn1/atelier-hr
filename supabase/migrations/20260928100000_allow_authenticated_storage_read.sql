-- Migration: Ensure Authenticated Access to Storage Bucket Documents (Passport Photos, ID Proofs, Attachments)
-- Created: 2026-09-28

-- 1. Create documents bucket if not exists
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- 2. Update storage policies
drop policy if exists "documents_bucket_select" on storage.objects;
create policy "documents_bucket_select" on storage.objects for select
  to authenticated using (bucket_id = 'documents');

drop policy if exists "documents_bucket_insert" on storage.objects;
create policy "documents_bucket_insert" on storage.objects for insert
  to authenticated with check (bucket_id = 'documents');

drop policy if exists "documents_bucket_update" on storage.objects;
create policy "documents_bucket_update" on storage.objects for update
  to authenticated using (bucket_id = 'documents');

drop policy if exists "documents_bucket_delete" on storage.objects;
create policy "documents_bucket_delete" on storage.objects for delete
  to authenticated using (bucket_id = 'documents' and is_admin());
