-- Thunder · 0013 latest rate instead of average
-- An influencer's profile rate per format is the LATEST amount they were paid for that format
-- (newest single-format deal by posting date, then by when the deal was created).
--   unit rate = payout / count   (e.g. "2 reels for ₹16,000" → ₹8,000 per reel)
-- Dropped and deleted deals are ignored. With no deal history, the quoted rate stays.
--
-- rate_stats now looks like:
--   {"reel": {"latest": 9000, "on": "2026-10-04", "deals": 3}, "all": {"latest_payout": 12000, "on": "2026-10-04", "deals": 4}}

create or replace function thunder_private.refresh_influencer_rates(p_ws uuid, p_influencer uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  stats jsonb := '{}'::jsonb;
  r record;
  lastrow record;
begin
  for r in
    with eligible as (
      select d.deliverables->0->>'format' as fmt,
             round(d.payout / greatest(coalesce((d.deliverables->0->>'count')::int, 1), 1)) as unit_rate,
             coalesce(d.posting_date, d.created_at::date) as on_date,
             d.created_at
      from public.deals_thunder d
      left join public.pipeline_stages_thunder s on s.workspace_id = d.workspace_id and s.id = d.stage_id
      where d.workspace_id = p_ws and d.influencer_id = p_influencer
        and d.deleted_at is null and d.payout is not null
        and coalesce(s.kind, 'open') <> 'dropped'
        and jsonb_array_length(d.deliverables) = 1
        and d.deliverables->0->>'format' in ('reel', 'story', 'carousel', 'collab')
    )
    select distinct on (fmt) fmt, unit_rate, on_date,
           count(*) over (partition by fmt) as n
    from eligible
    order by fmt, on_date desc, created_at desc
  loop
    stats := stats || jsonb_build_object(r.fmt, jsonb_build_object('latest', r.unit_rate, 'on', r.on_date, 'deals', r.n));
  end loop;

  select d.payout as latest_payout, coalesce(d.posting_date, d.created_at::date) as on_date,
         count(*) over () as n
    into lastrow
  from public.deals_thunder d
  left join public.pipeline_stages_thunder s on s.workspace_id = d.workspace_id and s.id = d.stage_id
  where d.workspace_id = p_ws and d.influencer_id = p_influencer
    and d.deleted_at is null and d.payout is not null
    and coalesce(s.kind, 'open') <> 'dropped'
  order by coalesce(d.posting_date, d.created_at::date) desc, d.created_at desc
  limit 1;
  if lastrow.n is not null then
    stats := stats || jsonb_build_object('all', jsonb_build_object('latest_payout', lastrow.latest_payout, 'on', lastrow.on_date, 'deals', lastrow.n));
  end if;

  update public.influencers_thunder i set
    rate_stats    = stats,
    rate_reel     = coalesce((stats->'reel'->>'latest')::numeric, i.rate_reel),
    rate_story    = coalesce((stats->'story'->>'latest')::numeric, i.rate_story),
    rate_carousel = coalesce((stats->'carousel'->>'latest')::numeric, i.rate_carousel),
    rate_collab   = coalesce((stats->'collab'->>'latest')::numeric, i.rate_collab)
  where i.workspace_id = p_ws and i.id = p_influencer
    and i.rate_stats is distinct from stats;
end;
$$;

-- The deal trigger must also react to posting-date changes, since "latest" depends on it.
drop trigger if exists deal_refresh_rates on public.deals_thunder;
create trigger deal_refresh_rates
  after insert or delete or update of payout, deliverables, stage_id, deleted_at, influencer_id, posting_date on public.deals_thunder
  for each row execute function thunder_private.deal_refresh_rates();

-- Recalculate everyone who has deals.
select thunder_private.refresh_influencer_rates(x.workspace_id, x.influencer_id)
from (select distinct workspace_id, influencer_id from public.deals_thunder) x;
