-- Thunder · 0017 campaign POC
-- Each campaign has a POC: the team member responsible for it. Changes are recorded in
-- activity_log_thunder by the existing campaigns trigger (who changed it, when, old and new value).

alter table public.campaigns_thunder add column if not exists poc_id uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'campaigns_thunder_poc_fk') then
    alter table public.campaigns_thunder
      add constraint campaigns_thunder_poc_fk foreign key (workspace_id, poc_id)
      references public.workspace_members_thunder (workspace_id, user_id) on delete set null (poc_id);
  end if;
end $$;

create index if not exists campaigns_poc_idx on public.campaigns_thunder (workspace_id, poc_id) where deleted_at is null;

-- Existing campaigns: the person who created them becomes the POC (if still a member).
update public.campaigns_thunder c set poc_id = c.created_by
where c.poc_id is null and c.created_by is not null
  and exists (select 1 from public.workspace_members_thunder m where m.workspace_id = c.workspace_id and m.user_id = c.created_by);

notify pgrst, 'reload schema';
