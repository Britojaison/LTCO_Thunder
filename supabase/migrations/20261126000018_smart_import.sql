-- Thunder · 0018 Smart Influencer Import Module
-- Additive, non-destructive migration:
--   1. Extends influencers_thunder with multi-platform & import fields (nullable handle when other social profile exists).
--   2. Adds role column on workspace_members_thunder (default 'admin' for backwards compatibility).
--   3. Creates import_mapping_templates_thunder, import_jobs_thunder, import_row_results_thunder, import_audit_records_thunder.

-- ─────────────────────────────────────────────────────────────
-- 1. Extend influencers_thunder (additive & backwards-compatible)
-- ─────────────────────────────────────────────────────────────
alter table public.influencers_thunder alter column handle drop not null;

alter table public.influencers_thunder
  add column if not exists country              text,
  add column if not exists bio                  text,
  add column if not exists subcategory          text,
  add column if not exists youtube_channel_name text,
  add column if not exists youtube_handle       text,
  add column if not exists youtube_channel_url  text,
  add column if not exists youtube_subscribers  int check (youtube_subscribers >= 0),
  add column if not exists facebook_profile_url text,
  add column if not exists other_profiles       jsonb not null default '[]'::jsonb,
  add column if not exists platform_account_ids jsonb not null default '{}'::jsonb,
  add column if not exists avg_likes            int check (avg_likes >= 0),
  add column if not exists avg_comments         int check (avg_comments >= 0),
  add column if not exists rate_youtube_video   numeric(12,2),
  add column if not exists rate_currency        text default 'INR',
  add column if not exists manager_name         text,
  add column if not exists tags                 text[] not null default '{}',
  add column if not exists enrichment_required  boolean not null default false,
  add column if not exists platform_tiers       jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'influencers_has_identity_chk') then
    alter table public.influencers_thunder
      add constraint influencers_has_identity_chk check (
        handle is not null
        or youtube_channel_url is not null
        or youtube_handle is not null
        or facebook_profile_url is not null
        or jsonb_array_length(other_profiles) > 0
      );
  end if;
end $$;

create unique index if not exists influencers_yt_url_uq
  on public.influencers_thunder (workspace_id, lower(youtube_channel_url))
  where deleted_at is null and youtube_channel_url is not null;

create unique index if not exists influencers_fb_url_uq
  on public.influencers_thunder (workspace_id, lower(facebook_profile_url))
  where deleted_at is null and facebook_profile_url is not null;

create index if not exists influencers_tags_gin on public.influencers_thunder using gin (tags);

-- ─────────────────────────────────────────────────────────────
-- 2. Workspace member roles (for permission-controlled import & rollback)
-- ─────────────────────────────────────────────────────────────
alter table public.workspace_members_thunder
  add column if not exists role text not null default 'admin'
  check (role in ('owner', 'admin', 'member', 'viewer'));

-- ─────────────────────────────────────────────────────────────
-- 3. Import mapping templates
-- ─────────────────────────────────────────────────────────────
create table if not exists public.import_mapping_templates_thunder (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces_thunder(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 120),
  mapping       jsonb not null default '{}'::jsonb,
  options       jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (workspace_id, id)
);

create unique index if not exists import_mapping_templates_name_uq
  on public.import_mapping_templates_thunder (workspace_id, lower(name))
  where deleted_at is null;

-- ─────────────────────────────────────────────────────────────
-- 4. Import jobs
-- ─────────────────────────────────────────────────────────────
create table if not exists public.import_jobs_thunder (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces_thunder(id) on delete cascade,
  idempotency_key     text,
  source_type         text not null check (source_type in ('csv', 'excel', 'google_sheets', 'urls')),
  file_name           text,
  sheet_name          text,
  source_url          text,
  duplicate_strategy  text not null default 'merge' check (duplicate_strategy in ('skip', 'update', 'merge')),
  default_currency    text,
  default_country     text not null default 'IN',
  status              text not null default 'pending'
                      check (status in ('pending', 'processing', 'completed', 'partially_completed', 'failed', 'cancelled', 'rolled_back')),
  total_rows          int not null default 0 check (total_rows >= 0),
  processed_rows      int not null default 0 check (processed_rows >= 0),
  created_count       int not null default 0 check (created_count >= 0),
  updated_count       int not null default 0 check (updated_count >= 0),
  merged_count        int not null default 0 check (merged_count >= 0),
  skipped_count       int not null default 0 check (skipped_count >= 0),
  failed_count        int not null default 0 check (failed_count >= 0),
  duration_ms         int check (duration_ms >= 0),
  error_summary       text,
  mapping_snapshot    jsonb not null default '{}'::jsonb,
  summary_snapshot    jsonb not null default '{}'::jsonb,
  created_by          uuid references auth.users(id) on delete set null,
  created_by_email    text,
  started_at          timestamptz,
  finished_at         timestamptz,
  rolled_back_at      timestamptz,
  rolled_back_by      uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (workspace_id, id)
);

create unique index if not exists import_jobs_idem_uq
  on public.import_jobs_thunder (workspace_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists import_jobs_ws_created_idx
  on public.import_jobs_thunder (workspace_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 5. Import row results (per-row outcome for reports & failed downloads)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.import_row_results_thunder (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  import_job_id   uuid not null,
  row_number      int not null,
  influencer_id   uuid,
  action          text not null check (action in ('created', 'updated', 'merged', 'skipped', 'failed', 'excluded')),
  status          text not null,
  handle          text,
  influencer_name text,
  reason          text,
  warnings        jsonb not null default '[]'::jsonb,
  raw_data        jsonb not null default '{}'::jsonb,
  normalized_data jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  foreign key (workspace_id, import_job_id) references public.import_jobs_thunder (workspace_id, id) on delete cascade
);

create index if not exists import_row_results_job_idx
  on public.import_row_results_thunder (workspace_id, import_job_id, row_number);

-- ─────────────────────────────────────────────────────────────
-- 6. Import audit records (supports safe rollback without clobbering later edits)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.import_audit_records_thunder (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  import_job_id   uuid not null,
  influencer_id   uuid not null,
  operation       text not null check (operation in ('create', 'update', 'merge')),
  before_snapshot jsonb,
  after_snapshot  jsonb not null,
  rolled_back_at  timestamptz,
  rolled_back_by  uuid references auth.users(id) on delete set null,
  rollback_status text check (rollback_status in ('rolled_back', 'skipped_modified')),
  created_at      timestamptz not null default now(),
  foreign key (workspace_id, import_job_id) references public.import_jobs_thunder (workspace_id, id) on delete cascade
);

create index if not exists import_audit_job_idx
  on public.import_audit_records_thunder (workspace_id, import_job_id);

-- ─────────────────────────────────────────────────────────────
-- 7. Triggers & RLS
-- ─────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'public.import_mapping_templates_thunder'::regclass) then
    perform thunder_private.track('public.import_mapping_templates_thunder');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'public.import_jobs_thunder'::regclass) then
    perform thunder_private.track('public.import_jobs_thunder');
  end if;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'import_mapping_templates_thunder',
    'import_jobs_thunder',
    'import_row_results_thunder',
    'import_audit_records_thunder'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format('drop policy if exists %1$s_insert on public.%1$I', t);
    execute format('drop policy if exists %1$s_update on public.%1$I', t);
    execute format($p$create policy %1$s_select on public.%1$I for select to authenticated
                     using ((select thunder_private.is_member(workspace_id)))$p$, t);
    execute format($p$create policy %1$s_insert on public.%1$I for insert to authenticated
                     with check ((select thunder_private.is_member(workspace_id)))$p$, t);
    execute format($p$create policy %1$s_update on public.%1$I for update to authenticated
                     using ((select thunder_private.is_member(workspace_id)))
                     with check ((select thunder_private.is_member(workspace_id)))$p$, t);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
