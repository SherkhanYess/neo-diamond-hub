-- 0005_seed.sql
-- Starter dictionaries and the system Owner role, per ТЗ.

insert into roles (id, name, is_system, caps, scope_type, sort_order)
values (
  '10000000-0000-0000-0000-000000000001',
  'Владелец',
  true,
  array['view_reports','enter_fact','edit_plan','approve_plan','decisions','settings'],
  'all',
  0
);

insert into client_tasks (name, segment, sort_order) values
  ('Сделать предложение руки и сердца', 'Помолвка', 1),
  ('Обручиться, ЗАГС', 'Помолвка', 2),
  ('Сырга салу', 'Помолвка', 3),
  ('Сделать подарок, показать своё отношение', 'Подарок', 4),
  ('Покупка для себя, подчеркнуть статус, порадовать себя', 'Для себя', 5),
  ('Значимое событие', 'Значимое событие', 6);

insert into demand_sources (name, sort_order) values
  ('Performance', 1),
  ('Контент', 2),
  ('Influence', 3),
  ('Walk-in', 4),
  ('TikTok-эфир', 5),
  ('CRM-маркетинг', 6);

insert into funnel_stages (name, is_qualification, is_sale, sort_order) values
  ('Обращение', false, false, 1),
  ('Квалифицирован', true, false, 2),
  ('Встреча назначена', false, false, 3),
  ('Встреча состоялась', false, false, 4),
  ('Продажа', false, true, 5),
  ('Полная оплата', false, false, 6),
  ('Выдача', false, false, 7);

insert into display_settings (id) values (1);
