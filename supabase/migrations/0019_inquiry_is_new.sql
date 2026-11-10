-- 0019_inquiry_is_new.sql
-- Обращение могло поставить источник сделке (новое) или нет (ответ в идущем
-- разговоре старой сделки без кода). Журнал хранит оба — для повторных касаний.
alter table crm_inquiries add column if not exists is_new boolean not null default true;
