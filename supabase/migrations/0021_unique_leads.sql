-- 0021_unique_leads.sql
-- Уникальный лид — первое обращение клиента (основного контакта amoCRM) за всю
-- историю аккаунта. Повторное обращение того же клиента (любой конвертер) —
-- не лид: в воронку и CPL не входит, считается отдельно «Повторные обращения»;
-- его продажа и выручка засчитываются как обычно.
alter table deals add column if not exists contact_id bigint;
alter table deals add column if not exists is_unique boolean not null default true;
create index if not exists deals_contact_idx on deals (contact_id);
