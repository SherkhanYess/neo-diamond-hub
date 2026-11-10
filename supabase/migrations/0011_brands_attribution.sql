-- 0011_brands_attribution.sql
-- v2 phase 1: brands, converters, UTM attribution, extended deal fields, spend.
-- Additive only. Every existing row becomes Neo Diamond via column defaults.

-- ---------------------------------------------------------------- brands
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

insert into brands (id, name, slug, sort_order) values
  ('20000000-0000-0000-0000-000000000001', 'Neo Diamond', 'neodiamond', 1),
  ('20000000-0000-0000-0000-000000000002', 'taena', 'taena', 2)
on conflict (id) do nothing;

-- Brand-owned dictionaries and data. NOT NULL + default backfills old rows.
alter table client_tasks   add column if not exists brand_id uuid not null default '20000000-0000-0000-0000-000000000001' references brands (id);
alter table demand_sources add column if not exists brand_id uuid not null default '20000000-0000-0000-0000-000000000001' references brands (id);
alter table ad_entities    add column if not exists brand_id uuid not null default '20000000-0000-0000-0000-000000000001' references brands (id);

-- Plans: commerce plans belong to a brand; sales-department plans are shared.
alter table plans add column if not exists kind text not null default 'commerce';
alter table plans add column if not exists brand_id uuid references brands (id);
update plans set brand_id = '20000000-0000-0000-0000-000000000001' where brand_id is null and kind = 'commerce';
do $$ begin
  alter table plans add constraint plans_kind_chk check (kind in ('commerce', 'sales'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table plans add constraint plans_commerce_brand_chk check (kind <> 'commerce' or brand_id is not null);
exception when duplicate_object then null; end $$;
alter table plans drop constraint if exists plans_month_branch_id_version_key;
create unique index if not exists plans_scope_version_uq
  on plans (month, branch_id, kind, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), version);

-- ------------------------------------------------------------ converters
create table if not exists converters (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null default '20000000-0000-0000-0000-000000000001' references brands (id),
  demand_source_id uuid not null references demand_sources (id) on delete cascade,
  name text not null,
  entry_source text not null default 'none' check (entry_source in ('taplink', 'site', 'ads', 'none')),
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists utm_rules (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null default '20000000-0000-0000-0000-000000000001' references brands (id),
  converter_id uuid not null references converters (id) on delete cascade,
  name text not null default '',
  match_source text,
  match_medium text,
  match_campaign text,
  match_content text,
  priority integer not null default 100,
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Ad cabinets map to a source (and optionally a converter) inside a brand.
alter table ad_entities add column if not exists demand_source_id uuid references demand_sources (id);
alter table ad_entities add column if not exists converter_id uuid references converters (id);

-- ----------------------------------------------------------------- deals
alter table deals add column if not exists brand_id uuid not null default '20000000-0000-0000-0000-000000000001' references brands (id);
alter table deals add column if not exists utm_source text;
alter table deals add column if not exists utm_medium text;
alter table deals add column if not exists utm_campaign text;
alter table deals add column if not exists utm_content text;
alter table deals add column if not exists utm_term text;
alter table deals add column if not exists converter_id uuid references converters (id);
alter table deals add column if not exists lead_manager_id uuid references profiles (id);
alter table deals add column if not exists consultant_id uuid references profiles (id);
alter table deals add column if not exists account_manager_id uuid references profiles (id);
alter table deals add column if not exists is_repeat boolean not null default false;
alter table deals add column if not exists first_response_minutes integer;

-- History: the single old manager becomes the consultant.
update deals set consultant_id = manager_id where consultant_id is null and manager_id is not null;

create index if not exists deals_brand_cohort_idx on deals (brand_id, branch_id, created_at);

-- -------------------------------------------------------------- spend
create table if not exists ad_daily_stats (
  ad_entity_id uuid not null references ad_entities (id) on delete cascade,
  day date not null,
  spend numeric not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  primary key (ad_entity_id, day)
);

create table if not exists spend_entries (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null default '20000000-0000-0000-0000-000000000001' references brands (id),
  demand_source_id uuid not null references demand_sources (id),
  converter_id uuid references converters (id),
  spent_on date not null,
  amount numeric not null default 0,
  name text not null default '',
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------- UTM resolution (SoT)
-- First non-archived rule of the brand (lowest priority) whose non-null
-- patterns all match. Patterns are case-insensitive, '*' is a wildcard.
create or replace function resolve_utm(
  p_brand uuid, p_source text, p_medium text, p_campaign text, p_content text
) returns uuid
language sql stable security definer set search_path = public as $$
  select r.converter_id
  from utm_rules r
  join converters c on c.id = r.converter_id and not c.is_archived
  where not r.is_archived
    and r.brand_id = p_brand
    and (r.match_source   is null or coalesce(p_source, '')   ilike replace(r.match_source,   '*', '%'))
    and (r.match_medium   is null or coalesce(p_medium, '')   ilike replace(r.match_medium,   '*', '%'))
    and (r.match_campaign is null or coalesce(p_campaign, '') ilike replace(r.match_campaign, '*', '%'))
    and (r.match_content  is null or coalesce(p_content, '')  ilike replace(r.match_content,  '*', '%'))
  order by r.priority, r.created_at
  limit 1
$$;

create or replace function deals_resolve_attribution() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.converter_id is null
     and coalesce(new.utm_source, new.utm_medium, new.utm_campaign, new.utm_content) is not null then
    new.converter_id := resolve_utm(new.brand_id, new.utm_source, new.utm_medium, new.utm_campaign, new.utm_content);
  end if;
  if new.converter_id is not null then
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
  before insert or update of utm_source, utm_medium, utm_campaign, utm_content, utm_term, converter_id, brand_id
  on deals for each row execute function deals_resolve_attribution();

-- ------------------------------------------------------------------ RLS
alter table brands enable row level security;
alter table converters enable row level security;
alter table utm_rules enable row level security;
alter table ad_daily_stats enable row level security;
alter table spend_entries enable row level security;

do $$
declare t text;
begin
  foreach t in array array['brands', 'converters', 'utm_rules']
  loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('create policy %I_read on %I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format(
      'create policy %I_write on %I for all to authenticated using (has_cap(''settings'')) with check (has_cap(''settings''))',
      t, t);
  end loop;
  foreach t in array array['ad_daily_stats', 'spend_entries']
  loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format(
      'create policy %I_read on %I for select to authenticated using (
         has_cap(''view_reports'') or has_cap(''edit_plan'') or has_cap(''approve_plan'') or has_cap(''settings''))', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format(
      'create policy %I_write on %I for all to authenticated
         using (has_cap(''enter_fact'') or has_cap(''settings''))
         with check (has_cap(''enter_fact'') or has_cap(''settings''))', t, t);
  end loop;
end $$;

grant execute on function resolve_utm(uuid, text, text, text, text) to authenticated;

-- Owner sees the «Все бренды» view.
update roles set caps = array_append(caps, 'all_brands')
where is_system and not ('all_brands' = any (caps));
