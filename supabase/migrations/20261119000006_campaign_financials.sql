-- Thunder · 0006 campaign financials
-- Campaigns have no budget. Money is calculated from the campaign's deals:
--   cost_to_client = sum of deal client prices
--   cost_to_agency = sum of influencer payouts
--   profit         = cost_to_client − cost_to_agency
--   profit_pct     = profit / cost_to_client × 100
-- Deals in a "dropped" stage and soft-deleted deals don't count.
-- This view is INTERNAL (it contains payouts). Client reports never read from it.

alter table public.campaigns_thunder drop column if exists budget;

create or replace view public.campaign_financials_thunder
with (security_invoker = true) as
select
  c.workspace_id,
  c.id                                                         as campaign_id,
  count(d.id)                                                  as influencer_count,
  count(d.id) filter (where d.client_price is null)            as missing_client_price,
  count(d.id) filter (where d.payout is null)                  as missing_payout,
  coalesce(sum(d.client_price), 0)::numeric(14,2)              as cost_to_client,
  coalesce(sum( d.payout), 0)::numeric(14,2)                    as cost_to_agency,
  (coalesce(sum(d.client_price), 0) - coalesce(sum(d.payout), 0))::numeric(14,2) as profit,
  case when coalesce(sum(d.client_price), 0) > 0
       then round((sum(d.client_price) - coalesce(sum(d.payout), 0)) / sum(d.client_price) * 100, 1)
  end                                                          as profit_pct
from public.campaigns_thunder c
left join public.deals_thunder d
  on d.workspace_id = c.workspace_id and d.campaign_id = c.id and d.deleted_at is null
  and not exists (
    select 1 from public.pipeline_stages_thunder s
    where s.workspace_id = d.workspace_id and s.id = d.stage_id and s.kind = 'dropped')
where c.deleted_at is null
group by c.workspace_id, c.id;

revoke all on public.campaign_financials_thunder from anon;
grant select on public.campaign_financials_thunder to authenticated;
