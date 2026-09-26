-- 0009_performance.sql
-- Ad-cabinet hierarchy (campaign → group → ad) + creative tags.
-- Populated by Meta/TikTok sync later; fields mirror what the sync writes.

create table ad_entities (
  id uuid primary key default gen_random_uuid(),
  cabinet text not null check (cabinet in ('meta', 'tiktok')),
  level text not null check (level in ('campaign', 'group', 'ad')),
  parent_id uuid references ad_entities (id) on delete cascade,
  external_id text not null,                 -- cabinet id; deals.ad_id matches an 'ad' external_id
  name text not null default '',
  spend numeric not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  preview_url text,
  created_at timestamptz not null default now(),
  unique (cabinet, external_id)
);

create index ad_entities_parent_idx on ad_entities (parent_id);

create table creative_tags (
  id uuid primary key default gen_random_uuid(),
  category text not null default '',         -- формат / хук / лицо / оффер / задуманная задача
  name text not null,
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table ad_tags (
  ad_entity_id uuid not null references ad_entities (id) on delete cascade,
  tag_id uuid not null references creative_tags (id) on delete cascade,
  primary key (ad_entity_id, tag_id)
);

-- Minimum qualified leads before a row's metrics are considered reliable.
alter table display_settings add column if not exists perf_min_quals integer not null default 10;

alter table ad_entities enable row level security;
alter table creative_tags enable row level security;
alter table ad_tags enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ad_entities','creative_tags','ad_tags']
  loop
    execute format(
      'create policy %I_read on %I for select to authenticated using (
         has_cap(''view_reports'') or has_cap(''edit_plan'') or has_cap(''approve_plan'') or has_cap(''settings'')
       )', t, t);
    execute format(
      'create policy %I_write on %I for all to authenticated
         using (has_cap(''enter_fact'') or has_cap(''settings''))
         with check (has_cap(''enter_fact'') or has_cap(''settings''))', t, t);
  end loop;
end $$;
