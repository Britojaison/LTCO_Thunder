-- Thunder · 0008 posts and metrics
-- A post has at most one 24h, one 7d and one 30d snapshot (re-entering a point updates it).
-- "adhoc" snapshots can be added any number of times.

create unique index if not exists metric_snapshots_point_uq
  on public.metric_snapshots_thunder (workspace_id, post_id, snapshot_point)
  where snapshot_point <> 'adhoc';

-- Latest numbers per post (whatever point was captured most recently).
create or replace view public.post_latest_metrics_thunder
with (security_invoker = true) as
select distinct on (m.post_id)
  m.workspace_id, m.post_id, m.snapshot_point, m.captured_at,
  m.views, m.likes, m.comments, m.shares, m.saves, m.reposts, m.reach, m.profile_visits, m.link_clicks
from public.metric_snapshots_thunder m
order by m.post_id, m.captured_at desc;

-- Snapshots that are due (or due within a day) and not yet entered, for non-archived campaigns.
create or replace view public.snapshots_due_thunder
with (security_invoker = true) as
select
  p.workspace_id, d.campaign_id, p.deal_id, p.id as post_id, p.url, p.format, d.owner_id,
  d.influencer_id, pt.point as snapshot_point, p.posted_at + pt.after as due_at
from public.posts_thunder p
join public.deals_thunder d on d.workspace_id = p.workspace_id and d.id = p.deal_id and d.deleted_at is null
join public.campaigns_thunder c on c.workspace_id = d.workspace_id and c.id = d.campaign_id
  and c.deleted_at is null and c.status <> 'archived'
cross join (values ('24h', interval '24 hours'), ('7d', interval '7 days'), ('30d', interval '30 days')) as pt(point, after)
where p.deleted_at is null and p.posted_at is not null
  and p.posted_at + pt.after <= now() + interval '1 day'
  and not exists (
    select 1 from public.metric_snapshots_thunder m
    where m.workspace_id = p.workspace_id and m.post_id = p.id and m.snapshot_point = pt.point);

revoke all on public.post_latest_metrics_thunder, public.snapshots_due_thunder from anon;
grant select on public.post_latest_metrics_thunder, public.snapshots_due_thunder to authenticated;

-- Members may correct a snapshot they entered by mistake.
create policy metric_snapshots_thunder_delete on public.metric_snapshots_thunder for delete to authenticated
  using ((select thunder_private.is_member(workspace_id)));
