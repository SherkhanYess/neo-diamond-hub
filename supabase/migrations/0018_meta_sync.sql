-- 0018_meta_sync.sql
-- Meta Ads → хаб (Edge Function meta-sync, pg_cron раз в час). Только чтение Meta.
-- Бренд = кабинет (решение владельца 11.11: act_4125632917710802 — taena, остальные — Neo Diamond).
--
-- Кабинеты в долларах, хаб считает в тенге: расход дня × официальный курс
-- Нацбанка РК на этот день (fx_rates) × (1 + НДС%). Бренд — по кабинету
-- (brand_rules по названию кампании можно добавить, по умолчанию пусто). Конвертер — по тому, куда
-- ведёт группа объявлений (WhatsApp / сайт / профиль). Привязку, исправленную
-- вручную в Настройках, синхронизация не трогает (mapped_by_hand).

create table if not exists fx_rates (
  day date primary key,
  usd numeric not null
);
alter table fx_rates enable row level security;
drop policy if exists fx_rates_read on fx_rates;
create policy fx_rates_read on fx_rates for select to authenticated using (true);

alter table ad_entities add column if not exists account_id text;
alter table ad_entities add column if not exists destination text;
alter table ad_entities add column if not exists mapped_by_hand boolean not null default false;

alter table ad_daily_stats add column if not exists spend_usd numeric;
alter table ad_daily_stats add column if not exists fx numeric;

insert into integrations (key, config) values ('meta', $cfg$
{
  "since": "2026-08-01",
  "api": "v21.0",
  "accounts": {
    "act_4125632917710802": { "name": "Taena",       "brand": "taena" },
    "act_1936182423861666": { "name": "neo.diamond", "brand": "neodiamond" },
    "act_1131837429520223": { "name": "neo almaty",  "brand": "neodiamond" },
    "act_2249608649267176": { "name": "neo ast",     "brand": "neodiamond" },
    "act_1127057363612569": { "name": "neo1",        "brand": "neodiamond" }
  },
  "brand_rules": [],
  "source": "Instagram",
  "destination_converter": {
    "WHATSAPP": "Реклама → WhatsApp",
    "WEBSITE": "Сайт-каталог",
    "INSTAGRAM_PROFILE": "Профиль (bio, сторис)",
    "INSTAGRAM_DIRECT": "Профиль (bio, сторис)"
  },
  "vat_pct": 0,
  "incremental_days": 3
}
$cfg$::jsonb)
on conflict (key) do nothing;
