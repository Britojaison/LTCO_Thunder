-- Thunder · 0002 core tables
-- Influencers, brands, campaigns, pipeline, deals, posts, metrics, reports, imports, jobs.
-- Conventions:
--   * every table has workspace_id; parents expose unique (workspace_id, id) so children
--     use composite foreign keys and can never point at another workspace's rows
--   * soft delete via deleted_at; no DELETE policy for app users (purged by nightly job)
--   * money is numeric(12,2) in INR

-- ─────────────────────────────────────────────────────────────
-- Workspace configuration
-- ─────────────────────────────────────────────────────────────
create table public.workspace_lists (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  list_type     text not null check (list_type in ('niche','content_style','city','language','format')),
  value         text not null,
  position      int  not null default 0,
  unique (workspace_id, list_type, value)
);

create table public.pipeline_stages (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  position      int  not null,
  kind          text not null default 'open' check (kind in ('open','done','dropped')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (workspace_id, id)
);
create index pipeline_stages_ws_idx on public.pipeline_stages (workspace_id, position);

create table public.custom_field_defs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  entity        text not null default 'influencer' check (entity in ('influencer')),
  key           text not null check (key ~ '^[a-z][a-z0-9_]{0,49}$'),
  label         text not null,
  field_type    text not null check (field_type in ('text','number','boolean','date','select','multiselect','url')),
  options       jsonb not null default '[]'::jsonb,
  position      int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (workspace_id, entity, key)
);

-- ─────────────────────────────────────────────────────────────
-- Influencers
-- ─────────────────────────────────────────────────────────────
create table public.influencers (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  -- basics
  name                text not null,
  handle              text not null check (handle ~ '^[a-z0-9._]{1,30}$'),  -- lowercase, no @
  profile_url         text generated always as ('https://www.instagram.com/' || handle || '/') stored,
  city                text,
  state               text,
  languages           text[] not null default '{}',
  gender              text check (gender in ('female','male','other','mixed')),
  age_group           text,
  phone               text,
  email               text,
  whatsapp            text,
  manager_contact     text,
  -- audience
  followers           int  check (followers >= 0),
  avg_reel_views      int  check (avg_reel_views >= 0),
  engagement_rate     numeric(6,3) check (engagement_rate >= 0),        -- percent
  audience            jsonb not null default '{}'::jsonb,               -- {cities:{..}, gender:{..}}
  followers_updated_at timestamptz,
  -- content
  niche_tags          text[] not null default '{}',
  content_styles      text[] not null default '{}',
  formats             text[] not null default '{}',                     -- reel, story, carousel, collab
  on_camera           boolean,
  sample_posts        text[] not null default '{}',
  -- commercial (current rates; history lives in rate_history)
  rate_reel           numeric(12,2),
  rate_story          numeric(12,2),
  rate_carousel       numeric(12,2),
  rate_collab         numeric(12,2),
  open_to_barter      boolean not null default false,
  gst_registered      boolean,
  negotiation_notes   text,
  -- internal
  rating_reliability  smallint check (rating_reliability between 1 and 5),
  rating_quality      smallint check (rating_quality between 1 and 5),
  rating_ease         smallint check (rating_ease between 1 and 5),
  is_blacklisted      boolean not null default false,
  blacklist_reason    text,
  fit_base_score      numeric(5,2),          -- precomputed, refreshed when inputs change
  quality_flags       text[] not null default '{}',
  custom_fields       jsonb not null default '{}'::jsonb,
  source              text not null default 'manual' check (source in ('manual','import','self_registration','api')),
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  unique (workspace_id, id)
);
create unique index influencers_handle_uq on public.influencers (workspace_id, handle) where deleted_at is null;
create index influencers_followers_idx  on public.influencers (workspace_id, followers)       where deleted_at is null;
create index influencers_er_idx         on public.influencers (workspace_id, engagement_rate) where deleted_at is null;
create index influencers_rate_reel_idx  on public.influencers (workspace_id, rate_reel)       where deleted_at is null;
create index influencers_city_idx       on public.influencers (workspace_id, city, state)     where deleted_at is null;
create index influencers_fit_idx        on public.influencers (workspace_id, fit_base_score desc nulls last) where deleted_at is null;
create index influencers_niche_gin      on public.influencers using gin (niche_tags);
create index influencers_lang_gin       on public.influencers using gin (languages);
create index influencers_formats_gin    on public.influencers using gin (formats);
create index influencers_name_trgm      on public.influencers using gin (name extensions.gin_trgm_ops);
create index influencers_handle_trgm    on public.influencers using gin (handle extensions.gin_trgm_ops);

create table public.influencer_competitor_promotions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  influencer_id uuid not null,
  brand_name    text not null,
  promoted_on   date not null,
  post_url      text,
  created_at    timestamptz not null default now(),
  foreign key (workspace_id, influencer_id) references public.influencers (workspace_id, id) on delete cascade
);
create index icp_lookup_idx on public.influencer_competitor_promotions (workspace_id, influencer_id, promoted_on desc);
create index icp_brand_idx  on public.influencer_competitor_promotions (workspace_id, lower(brand_name), promoted_on desc);

-- Public self-registration lands here for review (inserted only via submit_registration()).
create table public.pending_influencers (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  payload       jsonb not null,
  consent       boolean not null check (consent),
  consent_at    timestamptz not null default now(),
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  influencer_id uuid,
  created_at    timestamptz not null default now()
);
create index pending_influencers_ws_idx on public.pending_influencers (workspace_id, status, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Brands and campaigns
-- ─────────────────────────────────────────────────────────────
create table public.brands (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  name               text not null,
  logo_path          text,
  category           text,
  client_contacts    jsonb not null default '[]'::jsonb,   -- [{name, role, email, phone}]
  competitor_brands  text[] not null default '{}',
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  unique (workspace_id, id)
);
create unique index brands_name_uq on public.brands (workspace_id, lower(name)) where deleted_at is null;

create table public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  brand_id        uuid not null,
  name            text not null,
  brief           text,
  objective       text,
  start_date      date,
  end_date        date,
  budget          numeric(12,2) check (budget >= 0),
  deliverables    jsonb not null default '[]'::jsonb,   -- [{format, count}]
  target_profile  jsonb not null default '{}'::jsonb,   -- saved search filters
  status          text not null default 'planning' check (status in ('planning','live','completed','archived')),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (workspace_id, id),
  check (end_date is null or start_date is null or end_date >= start_date),
  foreign key (workspace_id, brand_id) references public.brands (workspace_id, id)
);
create index campaigns_ws_status_idx on public.campaigns (workspace_id, status) where deleted_at is null;
create index campaigns_brand_idx     on public.campaigns (workspace_id, brand_id);

-- ─────────────────────────────────────────────────────────────
-- Deals (one per influencer per campaign) and money
-- ─────────────────────────────────────────────────────────────
create table public.deals (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null,
  campaign_id        uuid not null,
  influencer_id      uuid not null,
  stage_id           uuid,
  owner_id           uuid,
  deliverables       jsonb not null default '[]'::jsonb,   -- [{format, count}]
  client_price       numeric(12,2) check (client_price >= 0),
  payout             numeric(12,2) check (payout >= 0),
  margin             numeric(12,2) generated always as (client_price - payout) stored,
  margin_pct         numeric(6,2)  generated always as (
                       case when client_price > 0 then round((client_price - payout) / client_price * 100, 2) end
                     ) stored,
  barter_value       numeric(12,2) check (barter_value >= 0),
  due_date           date,
  posting_date       date,
  usage_rights_days  int check (usage_rights_days >= 0),
  contract_path      text,
  -- payment tracking
  invoice_path       text,
  invoice_amount     numeric(12,2),
  tds_amount         numeric(12,2),
  gst_amount         numeric(12,2),
  payment_due_date   date,
  payment_status     text not null default 'pending' check (payment_status in ('pending','partly_paid','paid')),
  amount_paid        numeric(12,2) not null default 0,
  paid_on            date,
  position           int not null default 0,                -- order within a kanban column
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, campaign_id)   references public.campaigns (workspace_id, id),
  foreign key (workspace_id, influencer_id) references public.influencers (workspace_id, id),
  foreign key (workspace_id, stage_id)      references public.pipeline_stages (workspace_id, id),
  foreign key (workspace_id, owner_id)      references public.workspace_members (workspace_id, user_id)
    on delete set null (owner_id)
);
create unique index deals_one_per_influencer on public.deals (workspace_id, campaign_id, influencer_id) where deleted_at is null;
create index deals_pipeline_idx   on public.deals (workspace_id, campaign_id, stage_id, position) where deleted_at is null;
create index deals_influencer_idx on public.deals (workspace_id, influencer_id);
create index deals_owner_idx      on public.deals (workspace_id, owner_id) where deleted_at is null;
create index deals_payment_idx    on public.deals (workspace_id, payment_status, payment_due_date) where deleted_at is null;

create table public.contact_logs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  deal_id       uuid not null,
  channel       text not null check (channel in ('call','whatsapp','email','instagram_dm','other')),
  note          text,
  member_id     uuid references auth.users(id) on delete set null,
  contacted_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id) on delete cascade
);
create index contact_logs_deal_idx on public.contact_logs (workspace_id, deal_id, contacted_at desc);

create table public.rate_history (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  influencer_id   uuid not null,
  format          text not null,
  amount          numeric(12,2) not null,
  effective_date  date not null default current_date,
  campaign_id     uuid,
  deal_id         uuid,
  created_at      timestamptz not null default now(),
  foreign key (workspace_id, influencer_id) references public.influencers (workspace_id, id) on delete cascade
);
create index rate_history_idx on public.rate_history (workspace_id, influencer_id, effective_date desc);

-- ─────────────────────────────────────────────────────────────
-- Posts and metric snapshots (append-only; partition by month later)
-- ─────────────────────────────────────────────────────────────
create table public.posts (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  deal_id         uuid not null,
  url             text not null,
  format          text not null check (format in ('reel','story','carousel','collab','static')),
  posted_at       timestamptz,
  caption         text,
  thumbnail_path  text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id)
);
create index posts_deal_idx   on public.posts (workspace_id, deal_id) where deleted_at is null;
create index posts_posted_idx on public.posts (workspace_id, posted_at) where deleted_at is null;

create table public.metric_snapshots (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null,
  post_id          uuid not null,
  snapshot_point   text not null check (snapshot_point in ('24h','7d','30d','adhoc')),
  captured_at      timestamptz not null default now(),
  views            int check (views >= 0),
  likes            int check (likes >= 0),
  comments         int check (comments >= 0),
  shares           int check (shares >= 0),
  saves            int check (saves >= 0),
  reposts          int check (reposts >= 0),
  reach            int check (reach >= 0),
  profile_visits   int check (profile_visits >= 0),
  link_clicks      int check (link_clicks >= 0),
  screenshot_paths text[] not null default '{}',
  source           text not null default 'manual' check (source in ('manual','api')),
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (workspace_id, post_id) references public.posts (workspace_id, id)
);
create index metric_snapshots_post_idx on public.metric_snapshots (workspace_id, post_id, captured_at desc);

-- ─────────────────────────────────────────────────────────────
-- Reports, templates, saved searches
-- ─────────────────────────────────────────────────────────────
create table public.report_templates (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  brand_id      uuid not null,
  name          text not null,
  config        jsonb not null,           -- sections, metrics, snapshot point, cost display
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, brand_id) references public.brands (workspace_id, id)
);

create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  campaign_id   uuid not null,
  template_id   uuid,
  config        jsonb not null,           -- exact selections used for this PDF
  pdf_path      text,
  status        text not null default 'queued' check (status in ('queued','rendering','ready','failed')),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  foreign key (workspace_id, campaign_id) references public.campaigns (workspace_id, id),
  foreign key (workspace_id, template_id) references public.report_templates (workspace_id, id)
);
create index reports_campaign_idx on public.reports (workspace_id, campaign_id, created_at desc);

create table public.saved_searches (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  filters       jsonb not null,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- ─────────────────────────────────────────────────────────────
-- Background jobs (Meta refresh, PDFs, imports, reminders)
-- Service role only: no policies for app users.
-- ─────────────────────────────────────────────────────────────
create table public.jobs (
  id               bigint generated always as identity primary key,
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  kind             text not null,
  payload          jsonb not null default '{}'::jsonb,
  status           text not null default 'queued' check (status in ('queued','running','done','failed')),
  attempts         int  not null default 0,
  max_attempts     int  not null default 5,
  run_after        timestamptz not null default now(),
  idempotency_key  text,
  locked_at        timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create unique index jobs_idem_uq on public.jobs (workspace_id, kind, idempotency_key) where idempotency_key is not null;
create index jobs_pick_idx on public.jobs (status, run_after) where status = 'queued';

-- ─────────────────────────────────────────────────────────────
-- Triggers
-- ─────────────────────────────────────────────────────────────
select private.track('public.workspace_lists', false);
select private.track('public.pipeline_stages');
select private.track('public.custom_field_defs');
select private.track('public.influencers');
select private.track('public.influencer_competitor_promotions', false);
select private.track('public.pending_influencers', false);
select private.track('public.brands');
select private.track('public.campaigns');
select private.track('public.deals');
select private.track('public.contact_logs', false);
select private.track('public.posts');
select private.track('public.metric_snapshots', false);
select private.track('public.report_templates');
select private.track('public.reports', false);
select private.track('public.saved_searches');

-- New deals start in the workspace's first open stage.
create or replace function private.deal_default_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage_id is null then
    select s.id into new.stage_id
    from public.pipeline_stages s
    where s.workspace_id = new.workspace_id and s.deleted_at is null
    order by s.position
    limit 1;
  end if;
  return new;
end;
$$;
create trigger deal_default_stage before insert on public.deals
  for each row execute function private.deal_default_stage();

-- Every agreed payout is added to the influencer's rate history.
create or replace function private.deal_rate_history()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  fmt text;
begin
  if new.payout is null then return new; end if;
  if tg_op = 'UPDATE' and old.payout is not distinct from new.payout then return new; end if;

  select case when count(distinct d->>'format') = 1 and sum(coalesce((d->>'count')::int, 1)) = 1
              then min(d->>'format') else 'bundle' end
    into fmt
  from jsonb_array_elements(new.deliverables) d;

  insert into public.rate_history (workspace_id, influencer_id, format, amount, campaign_id, deal_id)
  values (new.workspace_id, new.influencer_id, coalesce(fmt, 'bundle'), new.payout, new.campaign_id, new.id);
  return new;
end;
$$;
create trigger deal_rate_history after insert or update of payout on public.deals
  for each row execute function private.deal_rate_history();

-- ─────────────────────────────────────────────────────────────
-- RLS: members get select/insert/update; no delete (soft delete only).
-- ─────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'workspace_lists','pipeline_stages','custom_field_defs','influencers',
    'influencer_competitor_promotions','brands','campaigns','deals','contact_logs',
    'rate_history','posts','metric_snapshots','report_templates','reports','saved_searches'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %1$s_select on public.%1$I for select to authenticated
                     using ((select private.is_member(workspace_id)))$p$, t);
    execute format($p$create policy %1$s_insert on public.%1$I for insert to authenticated
                     with check ((select private.is_member(workspace_id)))$p$, t);
    execute format($p$create policy %1$s_update on public.%1$I for update to authenticated
                     using ((select private.is_member(workspace_id)))
                     with check ((select private.is_member(workspace_id)))$p$, t);
  end loop;
end;
$$;

-- Small lookup/config tables can be hard-deleted by members.
create policy workspace_lists_delete on public.workspace_lists for delete to authenticated
  using ((select private.is_member(workspace_id)));
create policy icp_delete on public.influencer_competitor_promotions for delete to authenticated
  using ((select private.is_member(workspace_id)));

-- Pending registrations: members review (select/update) only.
alter table public.pending_influencers enable row level security;
create policy pending_select on public.pending_influencers for select to authenticated
  using ((select private.is_member(workspace_id)));
create policy pending_update on public.pending_influencers for update to authenticated
  using ((select private.is_member(workspace_id))) with check ((select private.is_member(workspace_id)));

-- Jobs: service role only.
alter table public.jobs enable row level security;
