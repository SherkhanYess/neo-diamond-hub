-- 0020_chat_origin.sql
-- Канал входящего сообщения (instagram_business / kz.api.kelesu / com.wazzup24.wz).
-- Сделке без кода и без источника конвертер ставится по каналу первого
-- сообщения: Директ → «Профиль», WhatsApp → «Без источника / WhatsApp».
alter table crm_lead_events add column if not exists origin text;
