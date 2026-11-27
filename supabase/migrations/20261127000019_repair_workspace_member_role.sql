-- Repair deployments where the smart-import tables were installed without the
-- workspace member role column. Existing members retain the historical admin
-- permissions used before roles were introduced.
alter table public.workspace_members_thunder
  add column if not exists role text not null default 'admin';

do $$ begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_members_thunder_role_check'
      and conrelid = 'public.workspace_members_thunder'::regclass
  ) then
    alter table public.workspace_members_thunder
      add constraint workspace_members_thunder_role_check
      check (role in ('owner', 'admin', 'member', 'viewer'));
  end if;
end $$;
