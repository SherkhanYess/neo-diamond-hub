-- 0003_settings_audit.sql
-- Single-row display settings and the settings change journal.

create table display_settings (
  id integer primary key default 1 check (id = 1),
  plan_color_low integer not null default 90,   -- below this %: "ниже плана"
  plan_color_ok integer not null default 100,   -- at/above low, below high-ish: "в плане"
  plan_color_high integer not null default 110, -- at/above this %: "выше плана"
  currency text not null default 'KZT',
  week_start integer not null default 1 check (week_start in (0, 1))
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles (id),
  entity text not null,
  entity_id uuid,
  action text not null check (action in ('create', 'update', 'archive', 'delete')),
  diff jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity, created_at desc);
