-- Thunder · 0001 foundation
-- Workspaces, members, invites, activity log and shared trigger helpers.
-- Every business table carries workspace_id; RLS checks it via thunder_private.is_member().

create extension if not exists pg_trgm with schema extensions;

create schema if not exists thunder_private;
revoke all on schema thunder_private from public;
grant usage on schema thunder_private to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Workspaces and membership
-- ─────────────────────────────────────────────────────────────
create table public.workspaces_thunder (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 1 and 120),
  logo_path     text,
  brand_colors  jsonb not null default '{}'::jsonb,   -- {primary, secondary} for reports
  settings      jsonb not null default '{}'::jsonb,   -- fit-score weights, defaults, etc.
  plan          text  not null default 'internal',    -- for later billing
  plan_limits   jsonb not null default '{}'::jsonb,   -- {influencers, members, ai_searches_month, pdfs_month}
  form_token    text  not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table public.workspace_members_thunder (
  workspace_id  uuid not null references public.workspaces_thunder(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  full_name     text,
  email         text not null,
  joined_at     timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members_thunder (user_id);

create table public.workspace_invites_thunder (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces_thunder(id) on delete cascade,
  email         text not null,
  token         text not null unique default replace(gen_random_uuid()::text, '-', ''),
  invited_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '14 days',
  accepted_at   timestamptz
);
create index workspace_invites_ws_idx on public.workspace_invites_thunder (workspace_id);

-- Who may create a new workspace. The auth system is shared with another app in this
-- Supabase project, so workspace creation is limited to listed emails.
-- Add people with: insert into public.access_allowlist_thunder (email) values ('you@agency.com');
-- Invited members do NOT need to be listed; they join through accept_invite_thunder().
create table public.access_allowlist_thunder (
  email     text primary key check (email = lower(email)),
  note      text,
  added_at  timestamptz not null default now()
);
alter table public.access_allowlist_thunder enable row level security;  -- no policies: SQL/service role only

-- RLS helper: evaluated once per query when wrapped as (select thunder_private.is_member(x)).
create or replace function thunder_private.is_member(ws uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members_thunder m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;
revoke all on function thunder_private.is_member(uuid) from public;
grant execute on function thunder_private.is_member(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Activity log (filled only by triggers)
-- ─────────────────────────────────────────────────────────────
create table public.activity_log_thunder (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null,
  actor_id      uuid,
  action        text not null,          -- insert | update | delete | restore | hard_delete
  table_name    text not null,
  record_id     text,
  before        jsonb,
  after         jsonb,
  at            timestamptz not null default now()
);
create index activity_log_ws_at_idx on public.activity_log_thunder (workspace_id, at desc);
create index activity_log_record_idx on public.activity_log_thunder (workspace_id, table_name, record_id);

create or replace function thunder_private.log_activity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  ws uuid;
  act text := lower(tg_op);
begin
  ws := case when tg_table_name = 'workspaces_thunder' then (r->>'id')::uuid
             else (r->>'workspace_id')::uuid end;

  if tg_op = 'UPDATE' then
    if (o->>'deleted_at') is null and (n->>'deleted_at') is not null then act := 'delete';
    elsif (o->>'deleted_at') is not null and (n->>'deleted_at') is null then act := 'restore';
    end if;
  elsif tg_op = 'DELETE' then
    act := 'hard_delete';
  end if;

  insert into public.activity_log_thunder (workspace_id, actor_id, action, table_name, record_id, before, after)
  values (ws, (select auth.uid()), act, tg_table_name,
          coalesce(r->>'id', r->>'user_id'), o, n);

  return coalesce(new, old);
end;
$$;

create or replace function thunder_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Attach updated_at + activity triggers to a table in one call.
create or replace function thunder_private.track(tbl regclass, has_updated_at boolean default true)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if has_updated_at then
    execute format('create trigger set_updated_at before update on %s
                    for each row execute function thunder_private.set_updated_at()', tbl);
  end if;
  execute format('create trigger log_activity after insert or update or delete on %s
                  for each row execute function thunder_private.log_activity()', tbl);
end;
$$;

select thunder_private.track('public.workspaces_thunder');
select thunder_private.track('public.workspace_members_thunder', false);
select thunder_private.track('public.workspace_invites_thunder', false);

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────
alter table public.workspaces_thunder        enable row level security;
alter table public.workspace_members_thunder enable row level security;
alter table public.workspace_invites_thunder enable row level security;
alter table public.activity_log_thunder      enable row level security;

-- Workspaces: members read and update; creation only through create_workspace().
create policy ws_select on public.workspaces_thunder for select to authenticated
  using ((select thunder_private.is_member(id)));
create policy ws_update on public.workspaces_thunder for update to authenticated
  using ((select thunder_private.is_member(id))) with check ((select thunder_private.is_member(id)));

-- Members: any member sees and removes members; joining only through accept_invite().
create policy wm_select on public.workspace_members_thunder for select to authenticated
  using ((select thunder_private.is_member(workspace_id)));
create policy wm_update_self on public.workspace_members_thunder for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy wm_delete on public.workspace_members_thunder for delete to authenticated
  using ((select thunder_private.is_member(workspace_id)));

-- Invites: full access for members.
create policy wi_all on public.workspace_invites_thunder for all to authenticated
  using ((select thunder_private.is_member(workspace_id)))
  with check ((select thunder_private.is_member(workspace_id)));

-- Activity log: read-only for members.
create policy al_select on public.activity_log_thunder for select to authenticated
  using ((select thunder_private.is_member(workspace_id)));
