-- Thunder · 0009 client reports
-- Client reports read ONLY from report_deals_thunder and report_post_metrics_thunder.
-- Neither has payout, margin, payment, ratings or internal notes. Dropped influencers are left out.

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
where d.deleted_at is null
  and not exists (
    select 1 from public.pipeline_stages_thunder s
    where s.workspace_id = d.workspace_id and s.id = d.stage_id and s.kind = 'dropped');

-- Reports are saved with the exact selections used; the PDF is produced by the browser.
alter table public.reports_thunder add column if not exists title text;
