-- 0014_ingest.sql
-- Deals arrive from the CRM keyed by their CRM id (upsert by crm_id).
create unique index if not exists deals_crm_id_uq on deals (crm_id) where crm_id is not null;
