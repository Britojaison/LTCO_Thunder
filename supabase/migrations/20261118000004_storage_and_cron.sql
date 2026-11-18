-- Thunder · 0004 storage and scheduled jobs (Supabase-specific)

-- Private bucket; every object path starts with the workspace id:
--   {workspace_id}/screenshots/..., {workspace_id}/contracts/..., {workspace_id}/reports/...
insert into storage.buckets (id, name, public)
values ('thunder-files', 'thunder-files', false)
on conflict (id) do nothing;

create policy thunder_files_select on storage.objects for select to authenticated
  using (bucket_id = 'thunder-files'
         and (select thunder_private.is_member(((storage.foldername(name))[1])::uuid)));
create policy thunder_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'thunder-files'
              and (select thunder_private.is_member(((storage.foldername(name))[1])::uuid)));
create policy thunder_files_update on storage.objects for update to authenticated
  using (bucket_id = 'thunder-files'
         and (select thunder_private.is_member(((storage.foldername(name))[1])::uuid)));
create policy thunder_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'thunder-files'
         and (select thunder_private.is_member(((storage.foldername(name))[1])::uuid)));

-- Nightly purge of soft-deleted rows (03:30 IST = 22:00 UTC).
create extension if not exists pg_cron;
select cron.schedule('thunder-purge-soft-deleted', '0 22 * * *', $$select thunder_private.purge_soft_deleted()$$);
