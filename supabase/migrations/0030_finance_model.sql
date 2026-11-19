-- 0030_finance_model.sql
-- Финмодель по месяцам (этап 2). Вводные — в jsonb, всё остальное считает src/lib/finance/model.js.
--   funds: { "<ключ фонда>": { "mode": "pct" | "amount" | "per_sale", "value": число } }
--   items: { "<ключ строки>": сумма в месяц }   — аренда, прочие, оклады по людям
--   charity_pct — благотворительность, % от дивидендов (входит в фонд дивидендов)
-- Новый месяц создаётся копией последней модели до него; старые месяцы не меняются.
create table if not exists fin_models (
  month date primary key,
  revenue numeric not null default 0,
  avg_check numeric not null default 0,
  funds jsonb not null default '{}'::jsonb,
  items jsonb not null default '{}'::jsonb,
  charity_pct numeric not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table fin_models enable row level security;
drop policy if exists fin_models_finance on fin_models;
create policy fin_models_finance on fin_models for all to authenticated using (has_cap('finance')) with check (has_cap('finance'));

-- Дата создания сделки Adesk: месяц продажи, когда нет ни акта, ни месяца в названии.
alter table adesk_projects add column if not exists created date;

-- Базовая модель — скрин 1 ТЗ (построена на ретро-данных сентября 2026).
insert into fin_models (month, revenue, avg_check, funds, items, charity_pct) values (
  '2026-09-01', 79206041.98, 1000000,
  '{
    "taxes":       {"mode": "pct",      "value": 1.6},
    "pct_sales":   {"mode": "pct",      "value": 4.35},
    "piece":       {"mode": "per_sale", "value": 27900},
    "purchases":   {"mode": "per_sale", "value": 469300},
    "transport":   {"mode": "per_sale", "value": 4150},
    "dividends":   {"mode": "pct",      "value": 60},
    "development": {"mode": "amount",   "value": 3500000},
    "reserve":     {"mode": "pct",      "value": 1},
    "ads":         {"mode": "pct",      "value": 15}
  }'::jsonb,
  '{
    "rent.almaty": 1500000, "rent.astana": 400000,
    "utilities.office": 100000,
    "salaries.danelya": 300000, "salaries.almas": 300000, "salaries.ablay": 300000, "salaries.gaukhar": 300000,
    "salaries.aruzhan": 200000, "salaries.mukhamed": 500000, "salaries.nargiza": 400000,
    "salaries.accountant": 100000, "salaries.aisultan": 450000, "salaries.designer": 200000,
    "other.internet": 13600, "other.amocrm": 22500, "other.adesk": 40000, "other.kelesu": 60000,
    "other.bitrix": 44000, "other.meta": 27900, "other.claude": 10000, "other.wazzup": 12000, "other.trustme": 38000
  }'::jsonb,
  2.5
) on conflict (month) do nothing;
