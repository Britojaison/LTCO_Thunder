-- Thunder · 0007 average rates from real deals
--
-- Each campaign deal has its own price. An influencer's profile rate is the AVERAGE of what
-- they were actually paid across deals, per format:
--   unit rate = payout / count, for deals with a single format (e.g. "2 reels" → payout/2)
--   bundle deals (mixed formats) count toward the average payout per deal only
-- Dropped and deleted deals are ignored. Until an influencer has deal history for a format,
-- the manually entered (quoted) rate stays in place.
--
-- rate_stats keeps the evidence, e.g.
--   {"reel": {"avg": 8500, "deals": 3}, "all": {"avg_payout": 9800, "deals": 4}}

alter table public.influencers_thunder
  add column if not exists rate_stats jsonb not null default '{}'::jsonb;

create or replace function thunder_private.refresh_influencer_rates(p_ws uuid, p_influencer uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  stats jsonb := '{}'::jsonb;
  r record;
  allrow record;
begin
  -- per-format unit averages from single-format deals
  for r in
    select d.deliverables->0->>'format' as fmt,
           round(avg(d.payout / greatest(coalesce((d.deliverables->0->>'count')::int, 1), 1))) as avg_rate,
           count(*) as n
    from public.deals_thunder d
    left join public.pipeline_stages_thunder s on s.workspace_id = d.workspace_id and s.id = d.stage_id
    where d.workspace_id = p_ws and d.influencer_id = p_influencer
      and d.deleted_at is null and d.payout is not null
      and coalesce(s.kind, 'open') <> 'dropped'
      and jsonb_array_length(d.deliverables) = 1
      and d.deliverables->0->>'format' in ('reel', 'story', 'carousel', 'collab')
    group by 1
  loop
    stats := stats || jsonb_build_object(r.fmt, jsonb_build_object('avg', r.avg_rate, 'deals', r.n));
  end loop;

  -- average payout per deal, any mix of deliverables
  select round(avg(d.payout)) as avg_payout, count(*) as n into allrow
  from public.deals_thunder d
  left join public.pipeline_stages_thunder s on s.workspace_id = d.workspace_id and s.id = d.stage_id
  where d.workspace_id = p_ws and d.influencer_id = p_influencer
    and d.deleted_at is null and d.payout is not null
    and coalesce(s.kind, 'open') <> 'dropped';
  if allrow.n > 0 then
    stats := stats || jsonb_build_object('all', jsonb_build_object('avg_payout', allrow.avg_payout, 'deals', allrow.n));
  end if;

  update public.influencers_thunder i set
    rate_stats    = stats,
    rate_reel     = coalesce((stats->'reel'->>'avg')::numeric, i.rate_reel),
    rate_story    = coalesce((stats->'story'->>'avg')::numeric, i.rate_story),
    rate_carousel = coalesce((stats->'carousel'->>'avg')::numeric, i.rate_carousel),
    rate_collab   = coalesce((stats->'collab'->>'avg')::numeric, i.rate_collab)
  where i.workspace_id = p_ws and i.id = p_influencer
    and i.rate_stats is distinct from stats;
end;
$$;

create or replace function thunder_private.deal_refresh_rates()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform thunder_private.refresh_influencer_rates(old.workspace_id, old.influencer_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.influencer_id is distinct from old.influencer_id) then
    perform thunder_private.refresh_influencer_rates(new.workspace_id, new.influencer_id);
  end if;
  return null;
end;
$$;

drop trigger if exists deal_refresh_rates on public.deals_thunder;
create trigger deal_refresh_rates
  after insert or delete or update of payout, deliverables, stage_id, deleted_at, influencer_id on public.deals_thunder
  for each row execute function thunder_private.deal_refresh_rates();

-- Rate history: one entry per deal (latest agreed payout), not one per edit.
create or replace function thunder_private.deal_rate_history()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  fmt text;
begin
  if tg_op = 'UPDATE' and old.payout is not distinct from new.payout and old.deliverables = new.deliverables then
    return new;
  end if;
  delete from public.rate_history_thunder where workspace_id = new.workspace_id and deal_id = new.id;
  if new.payout is null then return new; end if;

  select case when count(distinct d->>'format') = 1 and sum(coalesce((d->>'count')::int, 1)) = 1
              then min(d->>'format') else 'bundle' end
    into fmt
  from jsonb_array_elements(new.deliverables) d;

  insert into public.rate_history_thunder (workspace_id, influencer_id, format, amount, campaign_id, deal_id)
  values (new.workspace_id, new.influencer_id, coalesce(fmt, 'bundle'), new.payout, new.campaign_id, new.id);
  return new;
end;
$$;

drop trigger if exists deal_rate_history on public.deals_thunder;
create trigger deal_rate_history after insert or update of payout, deliverables on public.deals_thunder
  for each row execute function thunder_private.deal_rate_history();

-- Backfill for anyone who already has deals.
select thunder_private.refresh_influencer_rates(x.workspace_id, x.influencer_id)
from (select distinct workspace_id, influencer_id from public.deals_thunder) x;
