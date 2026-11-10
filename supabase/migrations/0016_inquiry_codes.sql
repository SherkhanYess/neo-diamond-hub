-- 0016_inquiry_codes.sql
-- Код обращения из первого сообщения (amoCRM Salesbot → функция amocrm-hook).
--
-- Функция пишет в UTM-поля сделки синтетические метки по коду, дальше работает
-- общее правило resolve_utm. Здесь — недостающие конвертеры и правила к ним,
-- журнал обращений (без текста сообщений) и источник «Рекомендации», который
-- менеджер выбирает сам и который не перебивается конвертером.

-- ------------------------------------------------------------ обращения
create table if not exists crm_inquiries (
  id bigint generated always as identity primary key,
  lead_id bigint not null,
  at timestamptz not null default now(),
  channel text,                 -- whatsapp | direct
  kind text not null,           -- ctwa | site | profile | 2gis | direct | none
  code text not null,
  brand text,
  entry text,                   -- ib is ip ia tb ta gs ht sh dd xx
  type text,                    -- price fitting help hint custom
  page text,                    -- feed model guide other
  ad_id text,
  ad_short text,
  utm jsonb not null default '{}'
);
create index if not exists crm_inquiries_lead_idx on crm_inquiries (lead_id, at);
alter table crm_inquiries enable row level security;
drop policy if exists crm_inquiries_read on crm_inquiries;
create policy crm_inquiries_read on crm_inquiries for select to authenticated
  using (has_cap('view_reports') or has_cap('settings'));

-- ------------------------------------------------- источник, выбранный вручную
alter table deals add column if not exists demand_source_fixed boolean not null default false;

create or replace function deals_resolve_attribution() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.converter_id is null
     and coalesce(new.utm_source, new.utm_medium, new.utm_campaign, new.utm_content) is not null then
    new.converter_id := resolve_utm(new.brand_id, new.utm_source, new.utm_medium, new.utm_campaign, new.utm_content);
  end if;
  -- «Рекомендации»: источник спроса выбрал менеджер, конвертер может быть любым.
  if new.converter_id is not null and not new.demand_source_fixed then
    select demand_source_id into new.demand_source_id from converters where id = new.converter_id;
  end if;
  if new.ad_id is null then
    if new.utm_term ~ '^[0-9]{6,}$' then
      new.ad_id := new.utm_term;
    elsif new.utm_content ~ '^[0-9]{6,}$' then
      new.ad_id := new.utm_content;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists deals_resolve_attribution on deals;
create trigger deals_resolve_attribution
  before insert or update of utm_source, utm_medium, utm_campaign, utm_content, utm_term, converter_id, brand_id, demand_source_fixed
  on deals for each row execute function deals_resolve_attribution();

-- ------------------------------------------ источники, конвертеры, правила
do $$
declare
  b record;
  s_none uuid; s_rec uuid; s_ig uuid; s_tt uuid;
  c uuid;
begin
  for b in select id from brands loop
    -- Без источника: WhatsApp без кода, сайт без меток.
    select id into s_none from demand_sources where brand_id = b.id and name = 'Без источника';
    if s_none is null then
      insert into demand_sources (brand_id, name, sort_order) values (b.id, 'Без источника', 900) returning id into s_none;
    end if;
    select id into s_rec from demand_sources where brand_id = b.id and name = 'Рекомендации';
    if s_rec is null then
      insert into demand_sources (brand_id, name, sort_order) values (b.id, 'Рекомендации', 800) returning id into s_rec;
    end if;
    select id into s_ig from demand_sources where brand_id = b.id and name = 'Instagram';
    select id into s_tt from demand_sources where brand_id = b.id and name = 'TikTok';

    -- WhatsApp без кода
    select id into c from converters where brand_id = b.id and demand_source_id = s_none and name = 'WhatsApp';
    if c is null then
      insert into converters (brand_id, demand_source_id, name, entry_source, sort_order)
      values (b.id, s_none, 'WhatsApp', 'none', 10) returning id into c;
      insert into utm_rules (brand_id, converter_id, name, match_source, match_medium, priority)
      values (b.id, c, 'Код: без кода', 'none', 'whatsapp', 15);
    end if;
    -- Сайт без меток
    c := null;
    select id into c from converters where brand_id = b.id and demand_source_id = s_none and name = 'Сайт-каталог';
    if c is null then
      insert into converters (brand_id, demand_source_id, name, entry_source, sort_order)
      values (b.id, s_none, 'Сайт-каталог', 'site', 20) returning id into c;
      insert into utm_rules (brand_id, converter_id, name, match_source, match_medium, priority)
      values (b.id, c, 'Код: сайт без меток', 'none', 'site', 15);
    end if;
    -- Директ без кода
    if s_ig is not null then
      c := null;
      select id into c from converters where brand_id = b.id and demand_source_id = s_ig and name = 'Директ';
      if c is null then
        insert into converters (brand_id, demand_source_id, name, entry_source, sort_order)
        values (b.id, s_ig, 'Директ', 'none', 40) returning id into c;
        insert into utm_rules (brand_id, converter_id, name, match_source, match_medium, priority)
        values (b.id, c, 'Код: Директ', 'instagram', 'direct', 15);
      end if;
    end if;
    -- TikTok → сайт
    if s_tt is not null then
      c := null;
      select id into c from converters where brand_id = b.id and demand_source_id = s_tt and name = 'Сайт-каталог';
      if c is null then
        insert into converters (brand_id, demand_source_id, name, entry_source, sort_order)
        values (b.id, s_tt, 'Сайт-каталог', 'site', 40) returning id into c;
        insert into utm_rules (brand_id, converter_id, name, match_source, match_medium, priority)
        values (b.id, c, 'Код: TikTok → сайт', 'tiktok', 'site', 20);
      end if;
    end if;
  end loop;
end $$;

-- Рефералка / сарафанное радио → «Рекомендации».
update integrations
set config = jsonb_set(
      jsonb_set(config, '{lead_source_direct}', '{"273761": "Рекомендации"}'::jsonb),
      '{referral_tags}', '["рефералка", "сарафан", "сарафанное радио", "рекомендация", "рекомендации"]'::jsonb)
where key = 'amocrm';
