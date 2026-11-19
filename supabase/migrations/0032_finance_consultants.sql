-- 0032_finance_consultants.sql
-- Внешние финансовые консультанты (решение владельца 19.11.2026): полный доступ к блоку
-- «Финансы» и только к нему. Роль с одним правом `finance`; пользователей создаёт владелец
-- в «Настройках → Пользователи» и отправляет ссылку с логином и паролем.

-- С одним правом «Финансы» нужна настройка Adesk (опорный остаток, особые статьи);
-- остальные интеграции консультанту не видны.
drop policy if exists integrations_read_finance on integrations;
create policy integrations_read_finance on integrations for select to authenticated
  using (key = 'adesk' and has_cap('finance'));

insert into roles (name, caps, scope_type, is_system, sort_order)
select 'Финансовый консультант', array['finance'], 'all', false, 50
where not exists (select 1 from roles where name = 'Финансовый консультант');
