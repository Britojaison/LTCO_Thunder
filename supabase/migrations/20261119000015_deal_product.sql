-- Thunder · 0015 product per influencer in a campaign
-- Each deal (influencer × campaign) records which product they promoted, e.g. "Skyr Mango".
-- Client reports can show or hide it.

alter table public.deals_thunder
  add column if not exists product text check (product is null or length(product) <= 120);

create index if not exists deals_product_idx on public.deals_thunder (workspace_id, campaign_id, product) where deleted_at is null;

-- Report view gains the product (new column added at the end, so the view can be replaced in place).
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
  d.posting_date,
  d.product
from public.deals_thunder d
join public.influencers_thunder i on i.workspace_id = d.workspace_id and i.id = d.influencer_id
join public.pipeline_stages_thunder s on s.workspace_id = d.workspace_id and s.id = d.stage_id
where d.deleted_at is null
  and s.in_reports is true;

-- Product suggestions for a brand: products already used in any of its campaigns.
create or replace view public.brand_products_thunder
with (security_invoker = true) as
select distinct d.workspace_id, c.brand_id, trim(d.product) as product
from public.deals_thunder d
join public.campaigns_thunder c on c.workspace_id = d.workspace_id and c.id = d.campaign_id
where d.deleted_at is null and d.product is not null and trim(d.product) <> '';

revoke all on public.brand_products_thunder from anon;
grant select on public.brand_products_thunder to authenticated;
