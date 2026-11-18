-- Thunder · one-off import: Milky Mist campaigns, Aug–Nov 2026 (15 reels, 13 influencers)
-- Run once in the Supabase SQL Editor. Safe to re-run: anything that already exists is skipped.
-- Cost in the sheet = cost to client. Payouts are left blank for the team to fill in.
-- Metrics go in as an "Other/latest" snapshot because the sheet doesn't say 24h/7d/30d.

do $$
declare
  v_email   text := 'brito.jaison@88gb.in';   -- your Thunder login
  v_ws      uuid;
  v_user    uuid;
  v_brand   uuid;
  v_stage   uuid;
  v_camp    uuid;
  v_inf     uuid;
  v_deal    uuid;
  v_post    uuid;
  r         record;
  n_inf int := 0; n_deal int := 0; n_post int := 0; n_snap int := 0;
begin
  select m.workspace_id, m.user_id into v_ws, v_user
  from public.workspace_members_thunder m
  join public.workspaces_thunder w on w.id = m.workspace_id and w.deleted_at is null
  where lower(m.email) = lower(v_email)
  order by m.joined_at limit 1;
  if v_ws is null then raise exception 'No Thunder workspace found for %', v_email; end if;

  select id into v_stage from public.pipeline_stages_thunder
  where workspace_id = v_ws and deleted_at is null and lower(name) = 'data collected' limit 1;

  -- Brand
  select id into v_brand from public.brands_thunder
  where workspace_id = v_ws and lower(name) = 'milky mist' and deleted_at is null;
  if v_brand is null then
    insert into public.brands_thunder (workspace_id, name, category, created_by)
    values (v_ws, 'Milky Mist', 'Dairy', v_user) returning id into v_brand;
  end if;

  for r in
    select * from (values
    ('SCM August', 'Mansi', 'khana_peena_recipe', 'Delhi NCR', 42000, '2026-08-06', 'https://www.instagram.com/reel/DbsT0GeJQA0/', 191075, 2124, 94, 669, 928, 52),
    ('SCM August', 'Darshan', 'foodie_gujarati11', 'Gujarat', 40000, '2026-08-07', 'https://www.instagram.com/reel/Dbu3jIfoKfj/', 1968117, 38400, 2411, 10800, 20100, 493),
    ('Skyr 4P', 'Manjusha', 'mom_n_cutiepies', 'Bangalore', 30000, '2026-10-05', 'https://www.instagram.com/reel/DeHSsw6TaN1/', 971371, 3630, 74, 5204, 6, 245),
    ('Skyr 4P', 'Monica', 'monica.agnihotri1', 'Bangalore', 50000, '2026-10-04', 'https://www.instagram.com/reel/DeEVfrkyV8t/', 2380678, 14400, 322, 12600, 310, 247),
    ('Skyr 4P', 'Sunitha', 'sukrith_komarshetty', 'Pune', 35000, '2026-10-04', 'https://www.instagram.com/reel/DeEtXpHo14_/', 503865, 11100, 106, 784, 6, 50),
    ('Skyr 4P UGC', 'Swati Muralidhar', 'swatipmuralidhar', 'Davangere', 5000, '2026-10-23', 'https://www.instagram.com/reel/De1jvrVugJ1/', 13229, 131, 4, 31, 58, 1),
    ('Skyr 4P UGC', 'Sandhya Balaji', 'fit.pataka', 'Chennai', 20000, '2026-10-20', 'https://www.instagram.com/reel/Det0Yx3zVnQ/', 6375, 138, 1, 10, 24, 1),
    ('Skyr 4P UGC', 'Nishita', 'nishita.roshnii', 'Chennai', 20000, '2026-11-04', 'https://www.instagram.com/reel/DfT-bRvNnvC/', 38552, 887, 7, 162, 226, 6),
    ('Navarathri', 'Padma', 'padmabalamurugan', 'Coimbatore', 10000, '2026-10-17', 'https://www.instagram.com/reel/Del-ljZSr0Z/', 8951, 182, 6, 14, 3, 3),
    ('Diwali', 'Darshan', 'foodie_gujarati11', 'Gujarat', 45000, '2026-11-03', 'https://www.instagram.com/reel/DfRdle3IzSI/', 194861, 2261, 93, 1194, 2380, 44),
    ('Diwali', 'Neelam', 'neelamscookingdiaries', 'Bangalore', 80000, '2026-11-03', 'https://www.instagram.com/reel/DfRoS_-hoZW/', 475377, 4970, 138, 5182, 10100, 81),
    ('Diwali', 'Vandana', 'vandanasamayal', 'Chennai', 20000, '2026-11-04', 'https://www.instagram.com/reel/DfUZ2UKIpSe/', 49247, 455, 7, 281, 600, null),
    ('Diwali', 'Purna', 'purna_recipes', 'Delhi', 30000, '2026-11-07', 'https://www.instagram.com/reel/DfcLnACsJLO/', 36880, 319, 101, 143, 308, 12),
    ('Cafe', 'Veronica', 'the_coimbatore_finds', 'Coimbatore', 18000, '2026-09-25', 'https://www.instagram.com/reel/DdtjTR2Izxz/', 169176, 2919, 14, 2766, 1588, 32)
    ) as t(campaign, name, handle, city, cost, posted, url, views, likes, comments, shares, saves, reposts)
  loop
    -- Campaign (dates span its posts)
    select id into v_camp from public.campaigns_thunder
    where workspace_id = v_ws and brand_id = v_brand and lower(name) = lower(r.campaign) and deleted_at is null;
    if v_camp is null then
      insert into public.campaigns_thunder (workspace_id, brand_id, name, status, deliverables, created_by)
      values (v_ws, v_brand, r.campaign,
              case r.campaign when 'Diwali' then 'live' when 'Skyr 4P UGC' then 'live' else 'completed' end,
              '[]'::jsonb, v_user)
      returning id into v_camp;
    end if;
    update public.campaigns_thunder set
      start_date = least(coalesce(start_date, r.posted::date), r.posted::date),
      end_date   = greatest(coalesce(end_date, r.posted::date), r.posted::date)
    where id = v_camp;

    -- Influencer (by handle)
    select id into v_inf from public.influencers_thunder
    where workspace_id = v_ws and handle = r.handle and deleted_at is null;
    if v_inf is null then
      insert into public.influencers_thunder (workspace_id, name, handle, city, formats, source, created_by)
      values (v_ws, r.name, r.handle, r.city, '{reel}', 'import', v_user) returning id into v_inf;
      n_inf := n_inf + 1;
    end if;

    -- Deal (one per influencer per campaign)
    select id into v_deal from public.deals_thunder
    where workspace_id = v_ws and campaign_id = v_camp and influencer_id = v_inf and deleted_at is null;
    if v_deal is null then
      insert into public.deals_thunder (workspace_id, campaign_id, influencer_id, stage_id, owner_id, deliverables,
                                        client_price, posting_date, created_by)
      values (v_ws, v_camp, v_inf, v_stage, v_user, '[{"format":"reel","count":1}]'::jsonb,
              r.cost, r.posted::date, v_user)
      returning id into v_deal;
      n_deal := n_deal + 1;
    end if;

    -- Post
    select id into v_post from public.posts_thunder
    where workspace_id = v_ws and deal_id = v_deal and url = r.url and deleted_at is null;
    if v_post is null then
      insert into public.posts_thunder (workspace_id, deal_id, url, format, posted_at, created_by)
      values (v_ws, v_deal, r.url, 'reel', (r.posted || 'T12:00:00+05:30')::timestamptz, v_user)
      returning id into v_post;
      n_post := n_post + 1;
    end if;

    -- Metrics snapshot (only if the post has none yet)
    if not exists (select 1 from public.metric_snapshots_thunder where workspace_id = v_ws and post_id = v_post) then
      insert into public.metric_snapshots_thunder (workspace_id, post_id, snapshot_point, views, likes, comments, shares, saves, reposts, source, created_by)
      values (v_ws, v_post, 'adhoc', r.views, r.likes, r.comments, r.shares, r.saves, r.reposts, 'manual', v_user);
      n_snap := n_snap + 1;
    end if;
  end loop;

  raise notice 'Imported: % new influencers, % new deals, % new posts, % new snapshots', n_inf, n_deal, n_post, n_snap;
end;
$$;
