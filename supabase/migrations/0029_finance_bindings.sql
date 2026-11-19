-- 0029_finance_bindings.sql
-- Привязки статей Adesk, найденные на данных августа–ноября 2026 (после первой загрузки).
-- Неочевидные статьи (Тимбилдинг, Объявление вакансии, Коррекция, Нераспределенные расходы,
-- Возмещение расходов) не привязываем — владелец решает в «Настройках → Привязка статей к фондам».

-- Две статьи возврата клиенту в Adesk: обе уменьшают поступления.
update integrations
set config = config || '{"special": {"acquiring": [583226], "refund": [2071983, 1469483]}}'::jsonb
where key = 'adesk';

update fin_items set name = 'Золото / серебро' where key = 'purchases.gold';

insert into fin_rules (priority, kind, category_id, item_id, note)
select 50, 'category', r.category_id, i.id, r.note
from (values
  (1880120::bigint, 'purchases.service',   'Сертификаты'),
  (576835,          'utilities.office',    'Коммунальные платежи'),
  (583229,          'utilities.office',    'Обслуживание офиса'),
  (583233,          'piece.kpi_marketing', 'ЗП: Премированная часть (KPI)'),
  (1469523,         'purchases.gold',      'Расходы на серебро'),
  (1810433,         'purchases.workshop',  'Переделка украшения'),
  (1469496,         'purchases.workshop',  'Нанесение гравировки')
) as r (category_id, item_key, note)
join fin_items i on i.key = r.item_key
where not exists (select 1 from fin_rules x where x.kind = 'category' and x.category_id = r.category_id);

-- «смм» в описании выплаты — это Аружан (ноябрь 2026).
update fin_people set match = array_append(match, 'смм') where name = 'Аружан' and not ('смм' = any (match));

-- «Наргиз KPI» (август) — имя бывает усечено.
update fin_people set match = array_append(match, 'Наргиз') where name = 'Наргиза' and not ('Наргиз' = any (match));

-- BINC в «Услугах специалистов» — консалтинг (ТЗ: «Консалтинг BINC» — фонд развития).
insert into fin_rules (priority, kind, category_id, text_match, item_id, note)
select 20, 'category_description', 583315, 'BINC', i.id, 'BINC — консалтинг, фонд развития'
from fin_items i where i.key = 'development.consulting'
and not exists (select 1 from fin_rules where kind = 'category_description' and category_id = 583315 and text_match = 'BINC');
