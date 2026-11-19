-- 0028_finance_opening.sql
-- Остаток на начало месяца для ДДС по фондам: опорный остаток из отчёта Adesk
-- (integrations.adesk.config.opening_anchor) ± движение денег по операциям между датами.
-- Текущие балансы счетов Adesk для этого не годятся: валютные счета переоцениваются по курсу.
update integrations
set config = config || '{"opening_anchor": {"date": "2026-09-01", "amount": 19872188.03, "note": "Остаток на 01.09.2026 из отчёта ДДС Adesk (эталон ТЗ)"}}'::jsonb
where key = 'adesk' and not (config ? 'opening_anchor');

-- Движение денег по всем счетам за [from, to): поступления плюс, платежи минус, переводы обеими ногами.
create or replace function fin_flow(p_from date, p_to date)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(case when type = 1 then amount_kzt else -amount_kzt end), 0)
  from adesk_transactions
  where date >= p_from and date < p_to
$$;
grant execute on function fin_flow(date, date) to authenticated;
