-- 0002_references.sql
-- Reference dictionaries. All share: id, name, sort_order, is_archived, created_at.

create table cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references cities (id),
  name text not null,
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Now that branches exists, attach the branch FKs deferred from 0001.
alter table role_branches
  add constraint role_branches_branch_fk
  foreign key (branch_id) references branches (id) on delete cascade;

alter table profile_branches
  add constraint profile_branches_branch_fk
  foreign key (branch_id) references branches (id) on delete cascade;

create table client_tasks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment text not null default '',
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table demand_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_owner_id uuid references profiles (id),
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  crm_value text,
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table funnel_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_qualification boolean not null default false,
  is_sale boolean not null default false,
  crm_status_id text,
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);
