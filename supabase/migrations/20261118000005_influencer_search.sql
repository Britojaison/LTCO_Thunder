-- Thunder · 0005 influencer search and fit score
--
-- Fit score (0–100) blends four components, each scored 0..1:
--   niche        overlap between the influencer's niche tags and the searched niches (query-time)
--   engagement   engagement rate vs the norm for the follower band
--   cost         cost per expected view (reel rate / average reel views); cheaper scores higher
--   performance  average of team ratings (reliability, quality, ease)
-- Weights live in workspaces_thunder.settings->'fit_weights' (default 25 each).
-- Missing data doesn't count as zero: a component with no data is left out and the
-- remaining weights are rescaled. The three non-query components are precomputed into
-- fit_base_score / fit_base_weight by a trigger; niche is blended in at search time.

alter table public.influencers_thunder
  add column if not exists fit_base_weight numeric(6,2);

create or replace function thunder_private.fit_weights(ws uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'niche',       coalesce((w.settings->'fit_weights'->>'niche')::numeric, 25),
    'engagement',  coalesce((w.settings->'fit_weights'->>'engagement')::numeric, 25),
    'cost',        coalesce((w.settings->'fit_weights'->>'cost')::numeric, 25),
    'performance', coalesce((w.settings->'fit_weights'->>'performance')::numeric, 25)
  )
  from public.workspaces_thunder w where w.id = ws;
$$;

-- Typical engagement rate (%) by follower band. Used to judge ER fairly across sizes.
create or replace function thunder_private.er_norm(followers int)
returns numeric
language sql immutable
set search_path = ''
as $$
  select case
    when followers is null     then null
    when followers <   10000   then 5.0
    when followers <   50000   then 3.5
    when followers <  100000   then 2.5
    when followers <  500000   then 2.0
    else                            1.5
  end;
$$;

create or replace function thunder_private.compute_fit_base()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  w     jsonb := thunder_private.fit_weights(new.workspace_id);
  eng   numeric;
  cost  numeric;
  perf  numeric;
  num   numeric := 0;
  den   numeric := 0;
  rsum  numeric;
  rcnt  int;
begin
  -- engagement: ER relative to band norm, capped at 2x norm
  if new.engagement_rate is not null and new.followers is not null then
    eng := least(new.engagement_rate / thunder_private.er_norm(new.followers), 2) / 2;
    num := num + (w->>'engagement')::numeric * eng;
    den := den + (w->>'engagement')::numeric;
  end if;

  -- cost: ₹ per expected view; ₹0.50/view scores 0.5, cheaper approaches 1
  if coalesce(new.rate_reel, 0) > 0 and coalesce(new.avg_reel_views, 0) > 0 then
    cost := 1 / (1 + (new.rate_reel / new.avg_reel_views) / 0.5);
    num := num + (w->>'cost')::numeric * cost;
    den := den + (w->>'cost')::numeric;
  end if;

  -- performance: average of whichever team ratings exist (1..5 -> 0..1)
  rsum := coalesce(new.rating_reliability, 0) + coalesce(new.rating_quality, 0) + coalesce(new.rating_ease, 0);
  rcnt := (new.rating_reliability is not null)::int + (new.rating_quality is not null)::int + (new.rating_ease is not null)::int;
  if rcnt > 0 then
    perf := (rsum / rcnt - 1) / 4;
    num := num + (w->>'performance')::numeric * perf;
    den := den + (w->>'performance')::numeric;
  end if;

  if den > 0 then
    new.fit_base_score  := round(100 * num / den, 2);
    new.fit_base_weight := den;
  else
    new.fit_base_score  := null;
    new.fit_base_weight := null;
  end if;
  return new;
end;
$$;

create trigger compute_fit_base before insert or update on public.influencers_thunder
  for each row execute function thunder_private.compute_fit_base();

-- Recompute after the workspace changes its fit weights.
create or replace function public.recompute_fit_scores_thunder(p_workspace_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.influencers_thunder set updated_at = updated_at where workspace_id = p_workspace_id;
$$;
revoke all on function public.recompute_fit_scores_thunder(uuid) from public, anon;
grant execute on function public.recompute_fit_scores_thunder(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- search_influencers_thunder: one call for filters, fit score, sort and paging.
-- SECURITY INVOKER: RLS still applies, so a user can only search their workspaces.
--
-- p_filters keys (all optional):
--   q text · niches text[] · cities text[] · states text[] · languages text[] · formats text[]
--   gender text · followers_min/max int · er_min/max numeric
--   rate_format ('reel'|'story'|'carousel'|'collab') · rate_min/max numeric
--   worked_before bool · include_blacklisted bool (default false)
--   competitor_brand_id uuid + competitor_days int  → exclude anyone who promoted one of
--     that brand's competitors in the last N days
-- p_sort: fit (default) | followers | er | rate | recent
-- ─────────────────────────────────────────────────────────────
create or replace function public.search_influencers_thunder(
  p_workspace_id uuid,
  p_filters jsonb default '{}'::jsonb,
  p_sort text default 'fit',
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid, name text, handle text, city text, state text, languages text[], niche_tags text[],
  formats text[], gender text, followers int, avg_reel_views int, engagement_rate numeric,
  rate_reel numeric, rate_story numeric, rate_carousel numeric, rate_collab numeric,
  is_blacklisted boolean, worked_before boolean, fit_score numeric, total_count bigint
)
language plpgsql stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_q text := nullif(trim(f->>'q'), '');
  v_niches text[] := case when jsonb_typeof(f->'niches') = 'array' and jsonb_array_length(f->'niches') > 0
                          then array(select lower(x) from jsonb_array_elements_text(f->'niches') x) end;
  v_cities text[] := case when jsonb_typeof(f->'cities') = 'array' and jsonb_array_length(f->'cities') > 0
                          then array(select lower(x) from jsonb_array_elements_text(f->'cities') x) end;
  v_states text[] := case when jsonb_typeof(f->'states') = 'array' and jsonb_array_length(f->'states') > 0
                          then array(select lower(x) from jsonb_array_elements_text(f->'states') x) end;
  v_langs text[] := case when jsonb_typeof(f->'languages') = 'array' and jsonb_array_length(f->'languages') > 0
                         then array(select lower(x) from jsonb_array_elements_text(f->'languages') x) end;
  v_formats text[] := case when jsonb_typeof(f->'formats') = 'array' and jsonb_array_length(f->'formats') > 0
                           then array(select lower(x) from jsonb_array_elements_text(f->'formats') x) end;
  v_gender text := nullif(f->>'gender', '');
  v_fmin int := (f->>'followers_min')::int;
  v_fmax int := (f->>'followers_max')::int;
  v_ermin numeric := (f->>'er_min')::numeric;
  v_ermax numeric := (f->>'er_max')::numeric;
  v_rfmt text := coalesce(nullif(f->>'rate_format', ''), 'reel');
  v_rmin numeric := (f->>'rate_min')::numeric;
  v_rmax numeric := (f->>'rate_max')::numeric;
  v_worked boolean := (f->>'worked_before')::boolean;
  v_incl_bl boolean := coalesce((f->>'include_blacklisted')::boolean, false);
  v_comp_brand uuid := nullif(f->>'competitor_brand_id', '')::uuid;
  v_comp_days int := coalesce((f->>'competitor_days')::int, 90);
  v_competitors text[];
  v_wn numeric := (thunder_private.fit_weights(p_workspace_id)->>'niche')::numeric;
begin
  if v_comp_brand is not null then
    select array(select lower(c) from unnest(b.competitor_brands) c) into v_competitors
    from public.brands_thunder b where b.workspace_id = p_workspace_id and b.id = v_comp_brand;
  end if;

  return query
  with base as (
    select i.*,
      exists (select 1 from public.deals_thunder d
              where d.workspace_id = i.workspace_id and d.influencer_id = i.id and d.deleted_at is null) as worked,
      case v_rfmt when 'story' then i.rate_story when 'carousel' then i.rate_carousel
                  when 'collab' then i.rate_collab else i.rate_reel end as rate_sel,
      case when v_niches is null then null
           else (select count(*) from unnest(v_niches) n where n = any (array(select lower(t) from unnest(i.niche_tags) t)))::numeric
                / cardinality(v_niches) end as niche_match
    from public.influencers_thunder i
    where i.workspace_id = p_workspace_id
      and i.deleted_at is null
      and (v_incl_bl or not i.is_blacklisted)
      and (v_q is null or i.name ilike '%' || v_q || '%' or i.handle ilike '%' || ltrim(lower(v_q), '@') || '%')
      and (v_niches is null or array(select lower(t) from unnest(i.niche_tags) t) && v_niches)
      and (v_cities is null or lower(i.city) = any (v_cities))
      and (v_states is null or lower(i.state) = any (v_states))
      and (v_langs is null or array(select lower(t) from unnest(i.languages) t) && v_langs)
      and (v_formats is null or array(select lower(t) from unnest(i.formats) t) && v_formats)
      and (v_gender is null or i.gender = v_gender)
      and (v_fmin is null or i.followers >= v_fmin)
      and (v_fmax is null or i.followers <= v_fmax)
      and (v_ermin is null or i.engagement_rate >= v_ermin)
      and (v_ermax is null or i.engagement_rate <= v_ermax)
      and (v_competitors is null or cardinality(v_competitors) = 0 or not exists (
            select 1 from public.influencer_competitor_promotions_thunder p
            where p.workspace_id = i.workspace_id and p.influencer_id = i.id
              and lower(p.brand_name) = any (v_competitors)
              and p.promoted_on >= current_date - v_comp_days))
  ),
  scored as (
    select b.*,
      round(case
        when b.niche_match is null then b.fit_base_score
        else (coalesce(b.fit_base_score * b.fit_base_weight, 0) + 100 * v_wn * b.niche_match)
             / nullif(coalesce(b.fit_base_weight, 0) + v_wn, 0)
      end, 0) as fit
    from base b
    where (v_rmin is null or b.rate_sel >= v_rmin)
      and (v_rmax is null or b.rate_sel <= v_rmax)
      and (v_worked is null or b.worked = v_worked)
  )
  select s.id, s.name, s.handle, s.city, s.state, s.languages, s.niche_tags, s.formats, s.gender,
         s.followers, s.avg_reel_views, s.engagement_rate, s.rate_reel, s.rate_story, s.rate_carousel,
         s.rate_collab, s.is_blacklisted, s.worked, s.fit, count(*) over ()
  from scored s
  order by
    case when p_sort = 'followers' then s.followers end desc nulls last,
    case when p_sort = 'er'        then s.engagement_rate end desc nulls last,
    case when p_sort = 'rate'      then s.rate_sel end asc nulls last,
    case when p_sort = 'recent'    then s.created_at end desc,
    s.fit desc nulls last,
    s.followers desc nulls last,
    s.id
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
end;
$$;
revoke all on function public.search_influencers_thunder(uuid, jsonb, text, int, int) from public, anon;
grant execute on function public.search_influencers_thunder(uuid, jsonb, text, int, int) to authenticated;

-- Approve a self-registration: create the influencer (or link an existing handle) in one step.
create or replace function public.approve_registration_thunder(p_pending_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  p public.pending_influencers_thunder;
  v_handle text;
  v_id uuid;
begin
  select * into p from public.pending_influencers_thunder where id = p_pending_id and status = 'pending' for update;
  if p.id is null then
    raise exception 'registration not found or already reviewed' using errcode = 'P0002';
  end if;

  v_handle := lower(regexp_replace(coalesce(p.payload->>'handle', ''), '^@|\s', '', 'g'));
  select i.id into v_id from public.influencers_thunder i
  where i.workspace_id = p.workspace_id and i.handle = v_handle and i.deleted_at is null;

  if v_id is null then
    insert into public.influencers_thunder (
      workspace_id, name, handle, city, state, languages, gender, phone, email, whatsapp,
      followers, avg_reel_views, niche_tags, formats, rate_reel, rate_story, open_to_barter, source, created_by)
    values (
      p.workspace_id,
      coalesce(nullif(trim(p.payload->>'name'), ''), v_handle),
      v_handle,
      nullif(trim(p.payload->>'city'), ''),
      nullif(trim(p.payload->>'state'), ''),
      coalesce(array(select jsonb_array_elements_text(p.payload->'languages')), '{}'),
      nullif(p.payload->>'gender', ''),
      nullif(trim(p.payload->>'phone'), ''),
      nullif(trim(p.payload->>'email'), ''),
      nullif(trim(p.payload->>'whatsapp'), ''),
      nullif(p.payload->>'followers', '')::int,
      nullif(p.payload->>'avg_reel_views', '')::int,
      coalesce(array(select lower(jsonb_array_elements_text(p.payload->'niche_tags'))), '{}'),
      coalesce(array(select lower(jsonb_array_elements_text(p.payload->'formats'))), '{}'),
      nullif(p.payload->>'rate_reel', '')::numeric,
      nullif(p.payload->>'rate_story', '')::numeric,
      coalesce((p.payload->>'open_to_barter')::boolean, false),
      'self_registration',
      (select auth.uid()))
    returning id into v_id;
  end if;

  update public.pending_influencers_thunder
  set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now(), influencer_id = v_id
  where id = p.id;
  return v_id;
end;
$$;
revoke all on function public.approve_registration_thunder(uuid) from public, anon;
grant execute on function public.approve_registration_thunder(uuid) to authenticated;

-- Public form header: returns the agency name for a valid form token (anon-safe, nothing else).
create or replace function public.registration_form_info_thunder(p_form_token text)
returns text
language sql stable security definer
set search_path = ''
as $$
  select w.name from public.workspaces_thunder w where w.form_token = p_form_token and w.deleted_at is null;
$$;
revoke all on function public.registration_form_info_thunder(text) from public;
grant execute on function public.registration_form_info_thunder(text) to anon, authenticated;
