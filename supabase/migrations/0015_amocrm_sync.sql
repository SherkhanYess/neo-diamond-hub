-- 0015_amocrm_sync.sql
-- amoCRM → hub sync (Edge Function amocrm-sync, every 10 minutes via pg_cron).
-- Read-only on the amoCRM side: the hub never writes to the CRM.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- One row per external integration: mapping config + sync cursor + last run.
create table if not exists integrations (
  key text primary key,
  config jsonb not null default '{}',
  state jsonb not null default '{}',
  last_run_at timestamptz,
  last_ok_at timestamptz,
  last_error text,
  last_stats jsonb
);
alter table integrations enable row level security;
drop policy if exists integrations_read on integrations;
create policy integrations_read on integrations for select using (has_cap('settings') or has_cap('view_reports'));
drop policy if exists integrations_write on integrations;
create policy integrations_write on integrations for update using (has_cap('settings')) with check (has_cap('settings'));

-- Raw lead history from amoCRM (stage moves, responsible changes): the stage
-- timeline of every deal is rebuilt from it. Service role only.
create table if not exists crm_lead_events (
  id text primary key,
  lead_id bigint not null,
  type text not null,
  at timestamptz not null,
  created_by bigint,
  pipeline_id bigint,
  status_id bigint,
  responsible_id bigint,
  prev_id bigint
);
create index if not exists crm_lead_events_lead_idx on crm_lead_events (lead_id, at);
alter table crm_lead_events enable row level security;

alter table deals add column if not exists crm_pipeline_id bigint;
alter table deals add column if not exists crm_status_id bigint;
alter table deals add column if not exists crm_responsible_id bigint;
alter table deals add column if not exists crm_updated_at timestamptz;

-- A plain unique constraint (NULLs allowed) so the sync can upsert by crm_id.
drop index if exists deals_crm_id_uq;
do $$ begin
  alter table deals add constraint deals_crm_id_key unique (crm_id);
exception when duplicate_object or duplicate_table then null; end $$;

-- Mapping (editable later from Settings). Ids come from the Neo Diamond amoCRM
-- account: pipelines, statuses, custom fields and enums.
insert into integrations (key, config) values ('amocrm', $cfg$
{
  "domain": "neodiamondkz",
  "since": "2026-08-01",
  "pipelines": {
    "9907362":  { "name": "Первичная продажа", "repeat": false },
    "10699698": { "name": "Повторная продажа", "repeat": true }
  },
  "status_stage": {
    "9907362": {
      "78728802": "Обращение", "86428934": "Обращение", "83826154": "Обращение",
      "78987818": "Обращение", "87656158": "Обращение", "83826166": "Обращение",
      "83826158": "Квалифицирован", "83826170": "Встреча назначена",
      "83826174": "Встреча состоялась", "83826178": "Продажа", "142": "Продажа"
    },
    "10699698": {
      "84307058": "Обращение", "84307062": "Обращение", "84307066": "Обращение",
      "84307070": "Обращение", "84307174": "Квалифицирован", "84307178": "Встреча назначена",
      "84307182": "Встреча состоялась", "84307186": "Продажа", "142": "Продажа"
    }
  },
  "fields": {
    "utm_source": 61411, "utm_medium": 61407, "utm_campaign": 61409,
    "utm_content": 61405, "utm_term": 61413,
    "lead_source": 411029, "occasion": 420033, "city": 409769,
    "meta_ad_id": [427679, 421871]
  },
  "lead_source_utm": {
    "271983": { "utm_source": "instagram", "utm_medium": "ctwa" },
    "271937": { "utm_source": "instagram", "utm_medium": "bio" },
    "271935": { "utm_source": "instagram", "utm_medium": "site" },
    "295499": { "utm_source": "instagram", "utm_medium": "site" },
    "271939": { "utm_source": "tiktok" },
    "271941": { "utm_source": "2gis" }
  },
  "lead_source_direct": { "273761": "CRM-маркетинг" },
  "occasion_task": {
    "284327": "Сделать предложение руки и сердца",
    "284329": "Сделать подарок, показать своё отношение",
    "284331": "Покупка для себя, подчеркнуть статус, порадовать себя"
  },
  "city_branch": { "268607": "Есентай Сити", "268609": "ЖК Атлант" },
  "user_alias": { "13662666": "danelkutzhanova@gmail.com" },
  "brand_tags": { "taena": "taena" },
  "ignore_tags": ["игнор"],
  "repeat_tags": ["повторная продажа"]
}
$cfg$::jsonb)
on conflict (key) do nothing;
