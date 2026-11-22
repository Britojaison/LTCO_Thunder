-- Thunder · 0016 Instagram API snapshots
-- Likes/comments pulled from Instagram (source = 'api') don't count as a 24h / 7d / 30d reading:
-- those still need the influencer's Insights numbers (views, reach, saves), entered by the team.

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
    where m.workspace_id = p.workspace_id and m.post_id = p.id and m.source = 'manual'
      and (m.snapshot_point = pt.point or m.captured_at >= p.posted_at + pt.after));
