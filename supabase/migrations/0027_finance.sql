-- 0027_finance.sql
-- Вкладка «Финансы», этап 1: копия Adesk (только чтение) + единый список фондов и правила
-- разнесения операций по фондам. Спека: docs/superpowers/specs/2026-11-19-finance-design.md.
-- Учёт общий на компанию (решение владельца 19.11.2026): бренда здесь нет.
-- Доступ — право `finance` (у владельца по умолчанию, выдаётся в «Настройках»).

-- ------------------------------------------------------------------ Adesk
create table if not exists adesk_accounts (
  id bigint primary key,
  name text not null,
  currency text not null default 'KZT',
  kind text not null default 'other' check (kind in ('cash', 'bank', 'fund', 'other')),
  kind_by_hand boolean not null default false,
  amount numeric,
  rate numeric,
  status text,
  synced_at timestamptz not null default now()
);
comment on table adesk_accounts is 'Счета Adesk. kind: нал / безнал / фондовый счёт; kind_by_hand — правлено в Настройках, синхронизация не трогает';

create table if not exists adesk_categories (
  id bigint primary key,
  name text not null,
  type int,               -- 1 доход, 2 расход
  group_name text,
  archived boolean not null default false,
  synced_at timestamptz not null default now()
);

create table if not exists adesk_projects (
  id bigint primary key,
  type text,              -- deal (заказ, 4 цифры) | product_deal (товар под реализацию)
  name text not null,
  category text,
  act_date date,          -- дата акта = месяц продажи
  deal_amount numeric,
  archived boolean not null default false,
  synced_at timestamptz not null default now()
);

create table if not exists adesk_transactions (
  id bigint primary key,
  date date not null,              -- дата операции (деньги)
  related_date date,               -- дата начисления: за какой месяц платёж
  type int not null,               -- 1 поступление, 2 платёж
  amount numeric not null,         -- в валюте счёта
  amount_kzt numeric not null,     -- в тенге по курсу операции Adesk
  account_id bigint,
  category_id bigint,
  project_id bigint,
  is_transfer boolean not null default false,
  transfer_id bigint,
  paired_id bigint,
  description text,
  contractor text,
  raw jsonb,
  synced_at timestamptz not null default now()
);
create index if not exists adesk_transactions_date on adesk_transactions (date);
create index if not exists adesk_transactions_project on adesk_transactions (project_id);

-- ------------------------------------------------------------------ Фонды и правила
create table if not exists fin_funds (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  block text not null check (block in ('variable', 'management', 'fixed')),
  calc text not null check (calc in ('pct_revenue', 'pct_revenue_per_sale', 'pct_margin', 'fixed_month', 'salaries')),
  per_sale boolean not null default false,   -- показывать «на одну продажу»
  sort int not null default 0
);
comment on table fin_funds is 'Единый список фондов для финмодели, ДДС и план-факта';

create table if not exists fin_items (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references fin_funds (id) on delete cascade,
  key text not null unique,
  name text not null,
  sort int not null default 0
);

create table if not exists fin_rules (
  id uuid primary key default gen_random_uuid(),
  priority int not null default 100,
  kind text not null check (kind in ('exclude_project', 'account_no_category', 'category_description', 'category')),
  category_id bigint,
  account_id bigint,
  text_match text,
  item_id uuid references fin_items (id) on delete cascade,
  note text
);
comment on table fin_rules is 'Как операция Adesk попадает в строку фонда; применяет src/lib/finance/classify.js';

create table if not exists fin_people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  match text[] not null default '{}',        -- имена/контрагент в описании операции
  categories bigint[] not null default '{}', -- статьи Adesk, по которым ему платят
  item_id uuid references fin_items (id),     -- строка оклада
  oklad numeric not null default 0,
  overflow_item_id uuid references fin_items (id), -- куда уходит выплата сверх оклада
  active boolean not null default true,
  sort int not null default 0
);
comment on table fin_people is 'Оклады по людям: выплата до оклада (по месяцу начисления) — в оклады, сверх — в процентный/сдельный фонд';

-- ------------------------------------------------------------------ Доступ
update roles set caps = array_append(caps, 'finance') where is_system and not ('finance' = any (caps));

do $$
declare t text;
begin
  foreach t in array array['adesk_accounts', 'adesk_categories', 'adesk_projects', 'adesk_transactions',
                           'fin_funds', 'fin_items', 'fin_rules', 'fin_people'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_finance on %I', t, t);
    execute format('create policy %I_finance on %I for all to authenticated using (has_cap(''finance'')) with check (has_cap(''finance''))', t, t);
  end loop;
end $$;

insert into integrations (key, config) values ('adesk', '{"since": "2026-08-01", "window_days": 60}'::jsonb)
on conflict (key) do nothing;

-- ------------------------------------------------------------------ Начальный список фондов (ТЗ 17.11.2026)
insert into fin_funds (key, name, block, calc, per_sale, sort) values
  ('taxes',       'Фонд налогов',                                  'variable',   'pct_revenue',          false, 10),
  ('pct_sales',   'Фонд ЗП процент от продаж',                     'variable',   'pct_revenue',          false, 20),
  ('piece',       'Фонд сдельной ЗП',                              'variable',   'pct_revenue_per_sale', true,  30),
  ('purchases',   'Фонд закупок',                                  'variable',   'pct_revenue_per_sale', true,  40),
  ('transport',   'Фонд транспортных',                             'variable',   'pct_revenue_per_sale', true,  50),
  ('dividends',   'Фонд дивидендов (включая благотворительность)', 'management', 'pct_margin',           false, 60),
  ('development', 'Фонд развития',                                 'management', 'pct_margin',           false, 70),
  ('reserve',     'Резервный фонд',                                'management', 'pct_margin',           false, 80),
  ('ads',         'Фонд рекламы и продвижения',                    'management', 'pct_margin',           false, 90),
  ('rent',        'Фонд аренды помещения',                         'fixed',      'fixed_month',          false, 100),
  ('utilities',   'Фонд коммунальных услуг (содержание офиса)',    'fixed',      'fixed_month',          false, 110),
  ('salaries',    'Фонд оплаты труда (оклады)',                    'fixed',      'salaries',             false, 120),
  ('other',       'Фонд прочих',                                   'fixed',      'fixed_month',          false, 130)
on conflict (key) do nothing;

insert into fin_items (fund_id, key, name, sort)
select f.id, i.key, i.name, i.sort
from (values
  ('taxes', 'taxes.profit', 'Налог 3% (упрощёнка)', 1),
  ('taxes', 'taxes.payroll', 'Налог на ФОТ', 2),
  ('pct_sales', 'pct_sales.bonus_danelya', 'Бонусы Данеля (сверх оклада)', 1),
  ('pct_sales', 'pct_sales.bonus_almas', 'Бонусы Алмас (сверх оклада)', 2),
  ('pct_sales', 'pct_sales.bonus_ablay', 'Бонусы Аблай (сверх оклада)', 3),
  ('pct_sales', 'pct_sales.share', 'Доля от продаж (товар под реализацию)', 4),
  ('pct_sales', 'pct_sales.other', 'Прочие выплаты отделу продаж', 5),
  ('piece', 'piece.kpi_nargiza', 'KPI производства (Наргиза)', 1),
  ('piece', 'piece.kpi_marketing', 'KPI маркетологов (сверх оклада)', 2),
  ('piece', 'piece.tiktok', 'ТикТок-стрим (за продажу)', 3),
  ('purchases', 'purchases.diamonds', 'Бриллианты', 1),
  ('purchases', 'purchases.gold', 'Золото', 2),
  ('purchases', 'purchases.workshop', 'Работа цеха', 3),
  ('purchases', 'purchases.dubai', 'Украшения Дубай', 4),
  ('purchases', 'purchases.stock', 'Товар в наличие (закупка украшений)', 5),
  ('purchases', 'purchases.packaging', 'Упаковка', 6),
  ('purchases', 'purchases.service', 'Сертификаты / сервис', 7),
  ('transport', 'transport.courier', 'Курьер', 1),
  ('transport', 'transport.cargo', 'Карго доставка', 2),
  ('dividends', 'dividends.dividends', 'Дивиденды', 1),
  ('dividends', 'dividends.profit', 'Вывод прибыли', 2),
  ('dividends', 'dividends.charity', 'Благотворительность', 3),
  ('development', 'development.consulting', 'Консалтинг', 1),
  ('development', 'development.repair', 'Ремонт', 2),
  ('ads', 'ads.ads', 'Реклама (таргет)', 1),
  ('ads', 'ads.model', 'Модель', 2),
  ('ads', 'ads.video', 'Видеограф', 3),
  ('ads', 'ads.studio', 'Аренда студии', 4),
  ('rent', 'rent.almaty', 'Аренда Алматы', 1),
  ('rent', 'rent.astana', 'Аренда Астана', 2),
  ('utilities', 'utilities.office', 'ТМЦ / содержание офиса', 1),
  ('salaries', 'salaries.danelya', 'Данеля — лид-менеджер', 1),
  ('salaries', 'salaries.almas', 'Алмас — консультант', 2),
  ('salaries', 'salaries.ablay', 'Аблай — консультант (Астана)', 3),
  ('salaries', 'salaries.gaukhar', 'Гаухар — TikTok-стример', 4),
  ('salaries', 'salaries.aruzhan', 'Аружан — SMM', 5),
  ('salaries', 'salaries.mukhamed', 'Мухамед — таргетолог (аутсорс)', 6),
  ('salaries', 'salaries.nargiza', 'Наргиза — менеджер по заказам', 7),
  ('salaries', 'salaries.accountant', 'Бухгалтер (аутсорс)', 8),
  ('salaries', 'salaries.aisultan', 'Айсултан — маркетолог', 9),
  ('salaries', 'salaries.designer', 'Дизайнер', 10),
  ('other', 'other.internet', 'Интернет', 1),
  ('other', 'other.amocrm', 'Amo CRM', 2),
  ('other', 'other.adesk', 'Adesk', 3),
  ('other', 'other.kelesu', 'Kelesu', 4),
  ('other', 'other.bitrix', 'Битрикс', 5),
  ('other', 'other.meta', 'Meta', 6),
  ('other', 'other.claude', 'Claude', 7),
  ('other', 'other.wazzup', 'Wazzup', 8),
  ('other', 'other.trustme', 'Trust me (договоры)', 9),
  ('other', 'other.bank', 'Банковское обслуживание', 10),
  ('other', 'other.change', 'Сдача клиентам', 11)
) as i (fund, key, name, sort)
join fin_funds f on f.key = i.fund
on conflict (key) do nothing;

-- Правила. Особые статьи (эквайринг, возврат, перевод) распознаёт classify.js по id статьи.
insert into fin_rules (priority, kind, category_id, account_id, text_match, item_id, note)
select r.priority, r.kind, r.category_id, r.account_id, r.text_match, i.id, r.note
from (values
  (1,  'exclude_project',      null::bigint, null::bigint, 'Статуетка', null, 'Статуэтка исключается отовсюду (ТЗ)'),
  (10, 'account_no_category',  null, 242480, null, 'ads.ads', 'Расходы без статьи с «Фонд маркетинга (долларовый счёт)» — реклама'),
  (20, 'category_description', 576837, null, 'Астана', 'rent.astana', 'Аренда Астана — по описанию операции'),
  (50, 'category', 576828,  null, null, 'taxes.profit', null),
  (50, 'category', 576829,  null, null, 'taxes.payroll', null),
  (50, 'category', 1469548, null, null, 'pct_sales.other', 'ФОТ отдела продаж без совпадения с человеком'),
  (50, 'category', 1973048, null, null, 'pct_sales.share', null),
  (50, 'category', 1894479, null, null, 'salaries.accountant', null),
  (50, 'category', 1469487, null, null, 'purchases.diamonds', null),
  (50, 'category', 1469520, null, null, 'purchases.gold', null),
  (50, 'category', 1469519, null, null, 'purchases.workshop', null),
  (50, 'category', 2071687, null, null, 'purchases.dubai', null),
  (50, 'category', 1698914, null, null, 'purchases.stock', null),
  (50, 'category', 1469532, null, null, 'purchases.packaging', null),
  (50, 'category', 1524768, null, null, 'purchases.packaging', null),
  (50, 'category', 1469526, null, null, 'purchases.service', null),
  (50, 'category', 1469494, null, null, 'transport.courier', null),
  (50, 'category', 1469493, null, null, 'transport.cargo', null),
  (50, 'category', 1469486, null, null, 'dividends.dividends', null),
  (50, 'category', 576823,  null, null, 'dividends.profit', null),
  (50, 'category', 1931519, null, null, 'dividends.charity', null),
  (50, 'category', 1845108, null, null, 'development.consulting', null),
  (50, 'category', 1957848, null, null, 'development.repair', null),
  (50, 'category', 1469525, null, null, 'ads.ads', null),
  (50, 'category', 1693720, null, null, 'ads.model', null),
  (50, 'category', 1693718, null, null, 'ads.video', null),
  (50, 'category', 1683546, null, null, 'ads.studio', null),
  (50, 'category', 576837,  null, null, 'rent.almaty', null),
  (50, 'category', 1822120, null, null, 'utilities.office', null),
  (50, 'category', 583290,  null, null, 'other.internet', null),
  (50, 'category', 1469498, null, null, 'other.amocrm', null),
  (50, 'category', 1999786, null, null, 'other.kelesu', null),
  (50, 'category', 1524522, null, null, 'other.bitrix', null),
  (50, 'category', 1624656, null, null, 'other.meta', null),
  (50, 'category', 1931536, null, null, 'other.claude', null),
  (50, 'category', 1562754, null, null, 'other.wazzup', null),
  (50, 'category', 576832,  null, null, 'other.bank', null),
  (50, 'category', 1469550, null, null, 'other.change', null)
) as r (priority, kind, category_id, account_id, text_match, item_key, note)
left join fin_items i on i.key = r.item_key
where not exists (select 1 from fin_rules);

-- Люди: оклад — по модели сентября 2026; сверх оклада — по ТЗ.
insert into fin_people (name, match, categories, item_id, oklad, overflow_item_id, sort)
select p.name, p.match, p.categories, i.id, p.oklad, o.id, p.sort
from (values
  ('Данеля',   array['Данеля', 'Данел'],           array[1469548]::bigint[],          'salaries.danelya',  300000, 'pct_sales.bonus_danelya', 1),
  ('Алмас',    array['Алмас'],                     array[1469548]::bigint[],          'salaries.almas',    300000, 'pct_sales.bonus_almas',   2),
  ('Аблай',    array['Аблай', 'Абылай'],           array[1469548]::bigint[],          'salaries.ablay',    300000, 'pct_sales.bonus_ablay',   3),
  ('Гаухар',   array['Гаухар'],                    array[1469548, 1526858]::bigint[], 'salaries.gaukhar',  300000, 'piece.tiktok',            4),
  ('Аружан',   array['Аружан'],                    array[1526858]::bigint[],          'salaries.aruzhan',  200000, 'piece.kpi_marketing',     5),
  ('Мухамед',  array['Мухамед', 'Yourmarketolog'], array[583315]::bigint[],           'salaries.mukhamed', 500000, null,                      6),
  ('Наргиза',  array['Наргиза'],                   array[1578117]::bigint[],          'salaries.nargiza',  400000, 'piece.kpi_nargiza',       7),
  ('Айсултан', array['Айсултан'],                  array[1526858]::bigint[],          'salaries.aisultan', 450000, 'piece.kpi_marketing',     8),
  ('Дизайнер', array['Дизайнер'],                  array[1526858]::bigint[],          'salaries.designer', 200000, null,                      9)
) as p (name, match, categories, item_key, oklad, overflow_key, sort)
join fin_items i on i.key = p.item_key
left join fin_items o on o.key = p.overflow_key
where not exists (select 1 from fin_people);
