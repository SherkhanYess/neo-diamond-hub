-- 0001_auth_roles.sql
-- Roles, profiles, and branch-scope link tables.
-- Branch FKs on the *_branches tables are added in 0002 after branches exists.

create extension if not exists "pgcrypto";

create table roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_system boolean not null default false,
  caps text[] not null default '{}',
  scope_type text not null default 'all' check (scope_type in ('all', 'branches')),
  is_archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role_id uuid references roles (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Restrict a role to specific branches (only meaningful when scope_type = 'branches').
create table role_branches (
  role_id uuid not null references roles (id) on delete cascade,
  branch_id uuid not null,
  primary key (role_id, branch_id)
);

-- Per-user branch restriction layered on top of the role.
create table profile_branches (
  profile_id uuid not null references profiles (id) on delete cascade,
  branch_id uuid not null,
  primary key (profile_id, branch_id)
);
