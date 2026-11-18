-- Thunder · 0003 RPCs and client-safe report views

-- ─────────────────────────────────────────────────────────────
-- create_workspace: creator becomes first member; default stages and lists seeded.
-- ─────────────────────────────────────────────────────────────
create or replace function public.create_workspace(p_name text, p_full_name text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  uid   uuid := (select auth.uid());
  email text := (select auth.jwt() ->> 'email');
  ws    uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.workspaces (name) values (trim(p_name)) returning id into ws;

  insert into public.workspace_members (workspace_id, user_id, full_name, email)
  values (ws, uid, nullif(trim(p_full_name), ''), coalesce(email, ''));

  insert into public.pipeline_stages (workspace_id, name, position, kind)
  select ws, s.name, s.pos, s.kind
  from (values
    ('Shortlisted', 1, 'open'), ('Contacted', 2, 'open'), ('Negotiating', 3, 'open'),
    ('Confirmed', 4, 'open'), ('Content review', 5, 'open'), ('Posted', 6, 'open'),
    ('Data collected', 7, 'open'), ('Paid', 8, 'done'), ('Dropped', 9, 'dropped')
  ) as s(name, pos, kind);

  insert into public.workspace_lists (workspace_id, list_type, value, position)
  select ws, l.t, l.v, l.p
  from (values
    ('content_style','Comedy',1), ('content_style','Review',2), ('content_style','Vlog',3), ('content_style','Aesthetic',4),
    ('format','Reel',1), ('format','Story',2), ('format','Carousel',3), ('format','Collab post',4),
    ('language','Tamil',1), ('language','Telugu',2), ('language','Kannada',3), ('language','Malayalam',4),
    ('language','Hindi',5), ('language','English',6)
  ) as l(t, v, p);

  return ws;
end;
$$;
revoke all on function public.create_workspace(text, text) from public, anon;
grant execute on function public.create_workspace(text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- accept_invite: the signed-in user's email must match the invite.
-- ─────────────────────────────────────────────────────────────
create or replace function public.accept_invite(p_token text, p_full_name text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  uid   uuid := (select auth.uid());
  email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  inv   public.workspace_invites;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into inv from public.workspace_invites
  where token = p_token and accepted_at is null and expires_at > now()
  for update;

  if inv.id is null then
    raise exception 'invite not found or expired' using errcode = 'P0002';
  end if;
  if lower(inv.email) <> email then
    raise exception 'invite was sent to a different email' using errcode = '42501';
  end if;

  insert into public.workspace_members (workspace_id, user_id, full_name, email)
  values (inv.workspace_id, uid, nullif(trim(p_full_name), ''), email)
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invites set accepted_at = now() where id = inv.id;
  return inv.workspace_id;
end;
$$;
revoke all on function public.accept_invite(text, text) from public, anon;
grant execute on function public.accept_invite(text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- submit_registration: public form (anon). Rate limiting + captcha happen in the route.
-- ─────────────────────────────────────────────────────────────
create or replace function public.submit_registration(p_form_token text, p_payload jsonb, p_consent boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  if p_consent is not true then
    raise exception 'consent is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or length(p_payload::text) > 20000 then
    raise exception 'invalid payload' using errcode = '22023';
  end if;

  select id into ws from public.workspaces
  where form_token = p_form_token and deleted_at is null;
  if ws is null then
    raise exception 'form not found' using errcode = 'P0002';
  end if;

  insert into public.pending_influencers (workspace_id, payload, consent)
  values (ws, p_payload, true);
end;
$$;
revoke all on function public.submit_registration(text, jsonb, boolean) from public;
grant execute on function public.submit_registration(text, jsonb, boolean) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Client-safe report views. Reports read ONLY from these.
-- No payout, margin, payment, ratings or internal notes columns exist here.
-- ─────────────────────────────────────────────────────────────
create view public.report_deals
with (security_invoker = true) as
select
  d.workspace_id,
  d.id            as deal_id,
  d.campaign_id,
  d.influencer_id,
  i.name          as influencer_name,
  i.handle        as influencer_handle,
  i.profile_url,
  i.followers,
  i.city,
  d.deliverables,
  d.client_price,
  d.posting_date
from public.deals d
join public.influencers i on i.workspace_id = d.workspace_id and i.id = d.influencer_id
where d.deleted_at is null;

create view public.report_post_metrics
with (security_invoker = true) as
select
  p.workspace_id,
  d.campaign_id,
  d.id             as deal_id,
  p.id             as post_id,
  p.url,
  p.format,
  p.posted_at,
  p.thumbnail_path,
  m.snapshot_point,
  m.captured_at,
  m.views, m.likes, m.comments, m.shares, m.saves, m.reposts, m.reach,
  m.profile_visits, m.link_clicks,
  m.screenshot_paths
from public.posts p
join public.deals d on d.workspace_id = p.workspace_id and d.id = p.deal_id
left join public.metric_snapshots m on m.workspace_id = p.workspace_id and m.post_id = p.id
where p.deleted_at is null and d.deleted_at is null;

revoke all on public.report_deals, public.report_post_metrics from anon;
grant select on public.report_deals, public.report_post_metrics to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Maintenance: purge soft-deleted rows older than 30 days (scheduled via pg_cron).
-- ─────────────────────────────────────────────────────────────
create or replace function private.purge_soft_deleted()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  t text;
begin
  -- children first so foreign keys are satisfied
  foreach t in array array[
    'posts','deals','report_templates','campaigns','brands','influencers',
    'saved_searches','custom_field_defs','pipeline_stages'
  ] loop
    begin
      execute format('delete from public.%I where deleted_at < now() - interval ''30 days''', t);
    exception when foreign_key_violation then
      raise notice 'purge skipped rows in % still referenced', t;
    end;
  end loop;
end;
$$;
revoke all on function private.purge_soft_deleted() from public;
