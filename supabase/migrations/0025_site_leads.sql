-- Заявки с сайта без WhatsApp (намёк taena) → сделка amoCRM через Edge Function site-lead.
-- Таблица — защита от дублей (повтор с тем же external_id возвращает ту же сделку)
-- и журнал: что пришло с сайта и какая сделка создана. Текст и телефон не храним.
create table if not exists public.site_leads (
  id bigint generated always as identity primary key,
  source text not null default 'taena',
  external_id text not null,
  type text not null,
  code text,
  lead_id bigint,
  contact_id bigint,
  contact_found boolean,
  error text,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);
comment on table public.site_leads is 'Заявки с сайта (намёк taena), созданные хабом в amoCRM; ключ от дублей — external_id сайта';

alter table public.site_leads enable row level security;
drop policy if exists site_leads_read on public.site_leads;
create policy site_leads_read on public.site_leads for select to authenticated using (true);
