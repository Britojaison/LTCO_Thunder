-- Thunder · 0014 client reports only include confirmed influencers
-- Each pipeline stage has an "in_reports" flag. Client reports include an influencer only when
-- their deal is in a stage with in_reports = true. Defaults: Confirmed and every stage after it
-- (Content review, Posted, Data collected, Paid). Shortlisted, Contacted, Negotiating and Dropped are out.

alter table public.pipeline_stages_thunder
  add column if not exists in_reports boolean;

-- Existing workspaces: Confirmed and every later, non-dropped stage.
update public.pipeline_stages_thunder s
set in_reports = (
  s.kind <> 'dropped'
  and s.position >= coalesce(
    (select c.position from public.pipeline_stages_thunder c
     where c.workspace_id = s.workspace_id and lower(c.name) = 'confirmed' and c.deleted_at is null
     limit 1), 0)
)
where s.in_reports is null;

-- New stages (including those seeded for new workspaces) get the same default by name.
create or replace function thunder_private.stage_default_in_reports()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.in_reports is null then
    new.in_reports := new.kind <> 'dropped'
      and lower(new.name) in ('confirmed', 'content review', 'posted', 'data collected', 'paid');
  end if;
  return new;
end;
$$;

drop trigger if exists stage_default_in_reports on public.pipeline_stages_thunder;
create trigger stage_default_in_reports before insert on public.pipeline_stages_thunder
  for each row execute function thunder_private.stage_default_in_reports();

alter table public.pipeline_stages_thunder alter column in_reports set default null;

-- Report view: only deals in a stage marked for reports.
create or replace view public.report_deals_thunder
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
from public.deals_thunder d
join public.influencers_thunder i on i.workspace_id = d.workspace_id and i.id = d.influencer_id
join public.pipeline_stages_thunder s on s.workspace_id = d.workspace_id and s.id = d.stage_id
where d.deleted_at is null
  and s.in_reports is true;

-- Post metrics for reports follow the same rule, so excluded influencers' numbers never reach a report.
create or replace view public.report_post_metrics_thunder
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
from public.posts_thunder p
join public.deals_thunder d on d.workspace_id = p.workspace_id and d.id = p.deal_id
join public.pipeline_stages_thunder s on s.workspace_id = d.workspace_id and s.id = d.stage_id
left join public.metric_snapshots_thunder m on m.workspace_id = p.workspace_id and m.post_id = p.id
where p.deleted_at is null and d.deleted_at is null
  and s.in_reports is true;
