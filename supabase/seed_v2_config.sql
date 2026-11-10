-- seed_v2_config.sql — starter v2 configuration (idempotent).
-- Channel-type demand sources per brand, their converters, UTM rules, taena tasks.
-- UTM convention (documented in Settings → UTM-правила):
--   utm_source = channel (instagram, 2gis, tiktok)
--   utm_medium = how the lead was captured:
--     bio | stories      → «Профиль»
--     site               → «Сайт-каталог»
--     ctwa | cpc         → «Реклама → WhatsApp» (click-to-WhatsApp)
--     live               → «Эфир» (TikTok)
--   utm_term / utm_content = numeric ad id (Meta {{ad.id}}) → deals.ad_id
do $$
declare
  nd uuid := '20000000-0000-0000-0000-000000000001';
  ta uuid := '20000000-0000-0000-0000-000000000002';
  b uuid;
  s_ig uuid; s_2g uuid; s_tt uuid;
  c_prof uuid; c_site uuid; c_ads uuid; c_card uuid; c_live uuid; c_ttads uuid; c_ttprof uuid; c_2gsite uuid;
  brand_ids uuid[] := array[nd, ta];
begin
  foreach b in array brand_ids loop
    -- sources
    insert into demand_sources (name, brand_id, sort_order)
      select v.n, b, v.o from (values ('Instagram', 10), ('2ГИС', 11), ('TikTok', 12)) v(n, o)
      where not exists (select 1 from demand_sources d where d.brand_id = b and d.name = v.n);
    select id into s_ig from demand_sources where brand_id = b and name = 'Instagram';
    select id into s_2g from demand_sources where brand_id = b and name = '2ГИС';
    select id into s_tt from demand_sources where brand_id = b and name = 'TikTok';

    -- converters
    insert into converters (brand_id, demand_source_id, name, entry_source, sort_order)
      select b, v.s, v.n, v.e, v.o from (values
        (s_ig, 'Профиль (bio, сторис)', case when b = nd then 'taplink' else 'none' end, 1),
        (s_ig, 'Сайт-каталог', 'site', 2),
        (s_ig, 'Реклама → WhatsApp', 'ads', 3),
        (s_2g, 'Карточка 2ГИС', 'none', 1),
        (s_2g, 'Сайт-каталог', 'site', 2),
        (s_tt, 'Профиль', 'none', 1),
        (s_tt, 'Эфир', 'none', 2),
        (s_tt, 'Реклама', 'ads', 3)
      ) v(s, n, e, o)
      where not exists (select 1 from converters c where c.demand_source_id = v.s and c.name = v.n);

    select id into c_prof  from converters where demand_source_id = s_ig and name = 'Профиль (bio, сторис)';
    select id into c_site  from converters where demand_source_id = s_ig and name = 'Сайт-каталог';
    select id into c_ads   from converters where demand_source_id = s_ig and name = 'Реклама → WhatsApp';
    select id into c_card  from converters where demand_source_id = s_2g and name = 'Карточка 2ГИС';
    select id into c_2gsite from converters where demand_source_id = s_2g and name = 'Сайт-каталог';
    select id into c_ttprof from converters where demand_source_id = s_tt and name = 'Профиль';
    select id into c_live  from converters where demand_source_id = s_tt and name = 'Эфир';
    select id into c_ttads from converters where demand_source_id = s_tt and name = 'Реклама';

    -- UTM rules (lower priority = checked first)
    insert into utm_rules (brand_id, converter_id, name, match_source, match_medium, priority)
      select b, v.c, v.n, v.s, v.m, v.p from (values
        (c_prof,   'Instagram bio',      'instagram', 'bio*',     10),
        (c_prof,   'Instagram сторис',   'instagram', 'stories*', 10),
        (c_site,   'Instagram → сайт',   'instagram', 'site',     20),
        (c_ads,    'Instagram CTWA',     'instagram', 'ctwa',     30),
        (c_ads,    'Instagram cpc',      'instagram', 'cpc',      30),
        (c_prof,   'Instagram прочее',   'instagram', null,       95),
        (c_2gsite, '2ГИС → сайт',        '2gis',      'site',     20),
        (c_card,   '2ГИС карточка',      '2gis',      null,       90),
        (c_live,   'TikTok эфир',        'tiktok',    'live*',    20),
        (c_ttads,  'TikTok реклама',     'tiktok',    'cpc',      30),
        (c_ttprof, 'TikTok профиль',     'tiktok',    null,       90)
      ) v(c, n, s, m, p)
      where not exists (select 1 from utm_rules r where r.converter_id = v.c and r.name = v.n);
  end loop;

  -- taena's own client tasks (engagement & wedding)
  insert into client_tasks (name, segment, brand_id, sort_order)
    select v.n, v.s, ta, v.o from (values
      ('Сделать предложение', 'Помолвка', 1),
      ('Обручальные кольца к свадьбе', 'Свадьба', 2)
    ) v(n, s, o)
    where not exists (select 1 from client_tasks t where t.brand_id = ta and t.name = v.n);
end $$;

select b.name brand, d.name source, count(c.*) converters,
       (select count(*) from utm_rules r join converters c2 on c2.id = r.converter_id where c2.demand_source_id = d.id) rules
from demand_sources d join brands b on b.id = d.brand_id left join converters c on c.demand_source_id = d.id
where d.name in ('Instagram', '2ГИС', 'TikTok')
group by b.name, b.sort_order, d.name, d.sort_order, d.id order by b.sort_order, d.sort_order;
