-- 1) Переходы в профиль Instagram: из рекламы (по объявлению) и всего по аккаунту.
alter table ad_daily_stats add column if not exists profile_visits integer not null default 0;

create table if not exists ig_daily_stats (
  ig_user_id     text not null,
  day            date not null,
  brand_id       uuid references brands(id),
  profile_views  integer not null default 0,
  reach          integer,
  primary key (ig_user_id, day)
);
alter table ig_daily_stats enable row level security;
drop policy if exists ig_daily_stats_read on ig_daily_stats;
create policy ig_daily_stats_read on ig_daily_stats for select
  using (has_cap('view_reports') or has_cap('edit_plan') or has_cap('approve_plan') or has_cap('settings'));

-- Instagram-аккаунты брендов (taena — когда его подключат к странице в Business Manager).
update integrations
   set config = config || jsonb_build_object('instagram', jsonb_build_object('17841471030240111', jsonb_build_object('brand', 'neodiamond', 'username', 'neodiamond.kz')))
 where key = 'meta';

-- Профиль Instagram: клики = переходы в профиль из статистики Instagram.
alter table converters drop constraint if exists converters_entry_source_check;
alter table converters add constraint converters_entry_source_check
  check (entry_source in ('taplink', 'site', 'ads', 'instagram', 'none'));
update converters set entry_source = 'instagram'
 where name = 'Профиль (bio, сторис)'
   and demand_source_id in (select id from demand_sources where name = 'Instagram');

-- 2) «Обращение» → «Заявка» (этап воронки и карта статусов amoCRM).
update funnel_stages set name = 'Заявка' where name = 'Обращение';
update integrations
   set config = replace(config::text, '"Обращение"', '"Заявка"')::jsonb
 where key = 'amocrm';

-- 3) Воронка «Гайд-каталог» рядом с каждым «Сайт-каталогом».
insert into converters (brand_id, demand_source_id, name, entry_source, sort_order, is_archived)
select c.brand_id, c.demand_source_id, 'Гайд-каталог', 'site', c.sort_order + 1, false
  from converters c
 where c.name = 'Сайт-каталог' and not c.is_archived
   and not exists (select 1 from converters g where g.demand_source_id = c.demand_source_id and g.name = 'Гайд-каталог');

-- Правило раньше «… → сайт»: страница гайда (utm_campaign = guide).
insert into utm_rules (brand_id, converter_id, name, match_source, match_medium, match_campaign, priority, sort_order, is_archived)
select g.brand_id, g.id, 'Гайд: ' || ds.name,
       case ds.name when 'Instagram' then 'instagram' when '2ГИС' then '2gis' when 'TikTok' then 'tiktok' else 'none' end,
       'site', 'guide',
       case ds.name when 'Без источника' then 14 else 19 end, 0, false
  from converters g join demand_sources ds on ds.id = g.demand_source_id
 where g.name = 'Гайд-каталог'
   and not exists (select 1 from utm_rules r where r.converter_id = g.id);

-- «Источник лида» = «Сайт · гайд» в amoCRM → страница guide.
update integrations
   set config = jsonb_set(config, '{lead_source_utm,295499}', '{"utm_source":"instagram","utm_medium":"site","utm_campaign":"guide"}'::jsonb)
 where key = 'amocrm';

-- Пересчитать атрибуцию сделок со страницы гайда.
update deals set utm_campaign = utm_campaign where utm_medium = 'site' and utm_campaign = 'guide';
