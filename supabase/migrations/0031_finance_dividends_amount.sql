-- 0031_finance_dividends_amount.sql
-- Решение владельца 19.11.2026: дивиденды и фонд развития задаются суммой — «мой уровень
-- необходимости», а не % маржи. Модель строится от дивидендов: экран показывает, какая
-- выручка нужна, чтобы их выплатить (src/lib/finance/model.js → requiredRevenue).
update fin_models
set funds = jsonb_set(funds, '{dividends}', '{"mode": "amount", "value": 21000000}'::jsonb)
where coalesce(funds -> 'dividends' ->> 'mode', 'pct') = 'pct';

update fin_models
set funds = jsonb_set(funds, '{development}', '{"mode": "amount", "value": 3500000}'::jsonb)
where coalesce(funds -> 'development' ->> 'mode', 'pct') = 'pct';
