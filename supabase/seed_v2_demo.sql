-- seed_v2_demo.sql — demo data in the v2 shape, November 1–10 2026.
-- Everything is tagged: deals.crm_id 'v2demo-…', ad_entities.external_id '1202…' /
-- name prefix, spend_entries.name 'v2demo …'. Remove with seed_v2_demo_cleanup.sql.
-- Attribution (converter/source/ad) is NOT set here: the deals trigger derives it
-- from UTM, which also exercises resolve_utm() end to end.
do $$
declare
  nd uuid := '20000000-0000-0000-0000-000000000001';
  ta uuid := '20000000-0000-0000-0000-000000000002';
  br_es uuid := 'b4013293-263e-4520-be6d-fc9f9003d41f';  -- Есентай Сити
  br_at uuid := 'd0a42824-96cf-4268-8e0c-4957d9de6653';  -- ЖК Атлант
  p_almas uuid := '6f40513b-f486-4775-8b60-baabb29fc85f';
  p_abylai uuid := '79950e02-140b-4d1b-bcde-cbff47578bbd';
  p_danelya uuid := 'be193113-4acc-4aae-8b02-b6b7d5b000c6';
  s_obr uuid; s_qual uuid; s_set uuid; s_held uuid; s_sale uuid; s_paid uuid;
  b uuid; i int; n int := 0; d_id uuid; day0 date; t0 timestamptz;
  conv record; task_ids uuid[]; checks numeric[]; k int;
  r_q float; r_set float; r_held float; r_sale float;
  depth int; rev numeric; ign bool; lead_mgr uuid; cons uuid; frm int;
  camp uuid; grp uuid; ad_ext text; ad_pool text[];
  crm_src uuid;
begin
  perform setseed(0.4242);
  select id into s_obr  from funnel_stages where sort_order = 1;
  select id into s_qual from funnel_stages where is_qualification;
  select id into s_set  from funnel_stages where sort_order = 3;
  select id into s_held from funnel_stages where sort_order = 4;
  select id into s_sale from funnel_stages where is_sale;
  select id into s_paid from funnel_stages where sort_order = 6;

  -- -------------------------------------------------------------- cleanup
  delete from deals where crm_id like 'v2demo-%';
  delete from ad_entities where name like 'v2demo · %';
  delete from spend_entries where name like 'v2demo %';

  -- ------------------------------------------------------- ad cabinets
  -- helper: (brand, cabinet, source name, converter name, campaign, ads[])
  for conv in
    select * from (values
      (nd, 'meta',   'Instagram', 'Реклама → WhatsApp', 'PRED_meta_ctwa_1126',  array['120210000000001','120210000000002','120210000000003'], array['UGC · рилс · оффер','Отзыв пары','Студия · крупный план']),
      (nd, 'meta',   'Instagram', 'Сайт-каталог',       'GIFT_meta_site_1126',  array['120210000000004','120210000000005'],                   array['Каталог · подарок','Каталог · для себя']),
      (nd, 'tiktok', 'TikTok',    'Реклама',            'TT_spark_1126',        array['120210000000006','120210000000007'],                   array['Spark · примерка','Spark · коробка']),
      (ta, 'meta',   'Instagram', 'Реклама → WhatsApp', 'TAENA_meta_ctwa_1126', array['120210000000101','120210000000102'],                   array['Предложение · сторителлинг','Кольца · сравнение']),
      (ta, 'meta',   'Instagram', 'Сайт-каталог',       'TAENA_meta_site_1126', array['120210000000103'],                                     array['Каталог taena'])
    ) v(brand, cab, src, cname, campaign, ads, names)
  loop
    insert into ad_entities (cabinet, level, external_id, name, brand_id, demand_source_id, converter_id)
      select conv.cab, 'campaign', 'c-' || conv.campaign, 'v2demo · ' || conv.campaign, conv.brand, ds.id, c.id
      from demand_sources ds join converters c on c.demand_source_id = ds.id and c.name = conv.cname
      where ds.brand_id = conv.brand and ds.name = conv.src
      returning id into camp;
    insert into ad_entities (cabinet, level, parent_id, external_id, name, brand_id, demand_source_id, converter_id)
      select conv.cab, 'group', camp, 'g-' || conv.campaign, 'v2demo · ' || conv.campaign || ' / группа', brand_id, demand_source_id, converter_id
      from ad_entities where id = camp
      returning id into grp;
    for k in 1 .. array_length(conv.ads, 1) loop
      insert into ad_entities (cabinet, level, parent_id, external_id, name, brand_id, demand_source_id, converter_id)
        select conv.cab, 'ad', grp, conv.ads[k], 'v2demo · ' || conv.names[k], brand_id, demand_source_id, converter_id
        from ad_entities where id = camp;
      insert into ad_daily_stats (ad_entity_id, day, spend, impressions, clicks)
        select a.id, dd::date,
               round(((14000 + random() * 22000) / k)::numeric, -2),
               (6000 + random() * 9000)::int,
               (60 + random() * 160)::int
        from ad_entities a, generate_series(date '2026-11-01', date '2026-11-10', interval '1 day') dd
        where a.external_id = conv.ads[k];
    end loop;
  end loop;

  -- ------------------------------------------------------- manual spend
  insert into spend_entries (brand_id, demand_source_id, spent_on, amount, name)
    select v.b, ds.id, date '2026-11-01', v.amt, 'v2demo ' || v.note
    from (values
      (nd, '2ГИС',   180000, 'размещение 2ГИС, ноябрь'),
      (nd, 'TikTok',  90000, 'эфиры — продюсер'),
      (ta, '2ГИС',   120000, 'размещение 2ГИС, ноябрь')
    ) v(b, src, amt, note)
    join demand_sources ds on ds.brand_id = v.b and ds.name = v.src;

  -- ---------------------------------------------------------------- deals
  -- conv rows: brand, utm_source, utm_medium, campaign, ad pool, leads, q/set/held/sale rates
  for conv in
    select * from (values
      (nd, 'instagram', 'bio',     null,                   null::text[],                                                         34, 0.72, 0.78, 0.82, 0.48),
      (nd, 'instagram', 'stories', null,                   null::text[],                                                         14, 0.66, 0.75, 0.80, 0.45),
      (nd, 'instagram', 'site',    'GIFT_meta_site_1126',  array['120210000000004','120210000000005'],                           22, 0.58, 0.72, 0.78, 0.42),
      (nd, 'instagram', 'ctwa',    'PRED_meta_ctwa_1126',  array['120210000000001','120210000000002','120210000000003'],         40, 0.44, 0.66, 0.74, 0.38),
      (nd, '2gis',      null,      null,                   null::text[],                                                         16, 0.78, 0.82, 0.86, 0.52),
      (nd, '2gis',      'site',    null,                   null::text[],                                                          8, 0.70, 0.78, 0.82, 0.48),
      (nd, 'tiktok',    'live',    null,                   null::text[],                                                         10, 0.50, 0.70, 0.75, 0.40),
      (nd, 'tiktok',    'cpc',     'TT_spark_1126',        array['120210000000006','120210000000007'],                           12, 0.34, 0.60, 0.70, 0.30),
      (ta, 'instagram', 'bio',     null,                   null::text[],                                                         18, 0.70, 0.78, 0.80, 0.46),
      (ta, 'instagram', 'site',    'TAENA_meta_site_1126', array['120210000000103'],                                             12, 0.60, 0.72, 0.78, 0.44),
      (ta, 'instagram', 'ctwa',    'TAENA_meta_ctwa_1126', array['120210000000101','120210000000102'],                           24, 0.46, 0.66, 0.74, 0.40),
      (ta, '2gis',      null,      null,                   null::text[],                                                          8, 0.76, 0.80, 0.85, 0.50)
    ) v(brand, src, med, campaign, ads, leads, rq, rset, rheld, rsale)
  loop
    b := conv.brand;
    if b = nd then
      select array_agg(id order by sort_order) into task_ids from client_tasks where brand_id = nd and not is_archived;
      checks := array[950000, 850000, 450000, 620000];
    else
      select array_agg(id order by sort_order) into task_ids from client_tasks where brand_id = ta and not is_archived;
      checks := array[720000, 380000];
    end if;

    for i in 1 .. conv.leads loop
      n := n + 1;
      day0 := date '2026-11-01' + (floor(random() * 10))::int;
      t0 := day0 + make_interval(hours => 9 + floor(random() * 11)::int, mins => floor(random() * 60)::int);
      lead_mgr := case when random() < 0.55 then p_almas else p_abylai end;
      frm := case when lead_mgr = p_almas then 3 + floor(random() * 18)::int else 6 + floor(random() * 40)::int end;
      depth := 1;
      if random() < conv.rq then depth := 2;
        if random() < conv.rset then depth := 3;
          if random() < conv.rheld then depth := 4;
            if random() < conv.rsale then depth := 5; end if;
          end if;
        end if;
      end if;
      ign := depth = 1 and random() < 0.55;
      k := 1 + floor(random() * array_length(task_ids, 1))::int;
      rev := round((checks[k] * (0.78 + random() * 0.44))::numeric, -3);
      cons := case when depth >= 4 then (case when random() < 0.6 then p_danelya else p_abylai end) end;
      ad_ext := case when conv.ads is not null then conv.ads[1 + floor(random() * array_length(conv.ads, 1))::int] end;

      insert into deals (crm_id, brand_id, branch_id, created_at, utm_source, utm_medium, utm_campaign, utm_term,
                         client_task_id, lead_manager_id, consultant_id, first_response_minutes,
                         current_stage_id, revenue, sale_at, is_ignored, lost_reason)
      values (
        'v2demo-' || n,
        b,
        case when b = nd and random() < 0.25 then br_at else br_es end,
        t0, conv.src, conv.med, conv.campaign, ad_ext,
        case when depth >= 2 then task_ids[k] end,
        lead_mgr, cons, frm,
        case depth when 1 then s_obr when 2 then s_qual when 3 then s_set when 4 then s_held else s_sale end,
        case when depth = 5 then rev end,
        case when depth = 5 then t0 + make_interval(days => 2 + floor(random() * 4)::int, hours => floor(random() * 8)::int) end,
        ign, case when ign then 'Игнор' end
      ) returning id into d_id;

      insert into deal_stage_events (deal_id, stage_id, entered_at) values (d_id, s_obr, t0);
      if depth >= 2 then insert into deal_stage_events values (default, d_id, s_qual, t0 + interval '3 hours'); end if;
      if depth >= 3 then insert into deal_stage_events values (default, d_id, s_set,  t0 + interval '1 day'); end if;
      if depth >= 4 then insert into deal_stage_events values (default, d_id, s_held, t0 + make_interval(days => 1, hours => floor(random() * 20)::int)); end if;
      if depth >= 5 then
        insert into deal_stage_events values (default, d_id, s_sale, (select sale_at from deals where id = d_id));
        if random() < 0.5 then
          insert into deal_stage_events values (default, d_id, s_paid, (select sale_at from deals where id = d_id) + interval '2 days');
        end if;
      end if;
    end loop;
  end loop;

  -- Repeat sales from the client base (Neo Diamond, account manager).
  select id into crm_src from demand_sources where brand_id = nd and name = 'CRM-маркетинг';
  select array_agg(id order by sort_order) into task_ids from client_tasks where brand_id = nd and not is_archived;
  for i in 1 .. 12 loop
    n := n + 1;
    t0 := date '2026-11-01' + (floor(random() * 10))::int + interval '12 hours';
    k := 1 + floor(random() * array_length(task_ids, 1))::int;
    depth := case when random() < 0.62 then 5 else 4 end;
    insert into deals (crm_id, brand_id, branch_id, created_at, demand_source_id, client_task_id,
                       account_manager_id, consultant_id, is_repeat, first_response_minutes,
                       current_stage_id, revenue, sale_at)
    values ('v2demo-' || n, nd, br_es, t0, crm_src, task_ids[k], p_danelya, p_danelya, true, 15,
            case depth when 5 then s_sale else s_held end,
            case when depth = 5 then round((500000 * (0.7 + random() * 0.8))::numeric, -3) end,
            case when depth = 5 then t0 + interval '2 days' end)
    returning id into d_id;
    insert into deal_stage_events (deal_id, stage_id, entered_at) values (d_id, s_obr, t0), (d_id, s_qual, t0), (d_id, s_set, t0), (d_id, s_held, t0 + interval '1 day');
    if depth = 5 then insert into deal_stage_events (deal_id, stage_id, entered_at) values (d_id, s_sale, t0 + interval '2 days'); end if;
  end loop;

  -- No future: nothing may happen after the moment the seed runs.
  delete from deals where crm_id like 'v2demo-%' and created_at > now();
  delete from deal_stage_events e using deals d
    where d.id = e.deal_id and d.crm_id like 'v2demo-%' and e.entered_at > now();
  update deals set sale_at = null, revenue = null
    where crm_id like 'v2demo-%' and sale_at > now();
  update deals d set current_stage_id = x.stage_id
  from (
    select distinct on (e.deal_id) e.deal_id, e.stage_id
    from deal_stage_events e
    join funnel_stages f on f.id = e.stage_id
    join deals dd on dd.id = e.deal_id
    where dd.crm_id like 'v2demo-%'
    order by e.deal_id, f.sort_order desc
  ) x
  where x.deal_id = d.id;
  delete from ad_daily_stats where day > current_date;
end $$;

select b.name brand, coalesce(ds.name, '—') source, coalesce(c.name, '—') converter,
       count(*) leads, count(*) filter (where d.sale_at is not null) sales,
       count(*) filter (where d.ad_id is not null) with_ad
from deals d join brands b on b.id = d.brand_id
left join demand_sources ds on ds.id = d.demand_source_id left join converters c on c.id = d.converter_id
where d.crm_id like 'v2demo-%'
group by 1, 2, 3, b.sort_order order by b.sort_order, 2, 3;
