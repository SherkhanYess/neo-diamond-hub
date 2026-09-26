-- 0004_rls.sql
-- Helper functions + row-level security.
-- Reading reference/config data is open to any authenticated user.
-- Writing anything requires the 'settings' capability.

-- Caps of the currently authenticated user.
create or replace function current_caps()
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(r.caps, '{}')
  from profiles p
  join roles r on r.id = p.role_id
  where p.id = auth.uid() and p.is_active
$$;

-- True when the current user has a given capability.
create or replace function has_cap(cap text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select cap = any(current_caps())
$$;

-- Branch ids the current user may see.
-- scope_type='all' with no personal restriction => all branches.
-- Otherwise the intersection of role_branches and profile_branches (whichever are set).
create or replace function current_branch_ids()
returns setof uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_role uuid;
  v_scope text;
  has_profile_scope boolean;
begin
  select p.role_id, r.scope_type into v_role, v_scope
  from profiles p join roles r on r.id = p.role_id
  where p.id = auth.uid();

  select exists(select 1 from profile_branches where profile_id = auth.uid())
  into has_profile_scope;

  if v_scope = 'all' and not has_profile_scope then
    return query select id from branches;
    return;
  end if;

  return query
  select b.id from branches b
  where (v_scope = 'all' or b.id in (select branch_id from role_branches where role_id = v_role))
    and (not has_profile_scope or b.id in (select branch_id from profile_branches where profile_id = auth.uid()));
end;
$$;

-- Enable RLS everywhere.
alter table roles enable row level security;
alter table profiles enable row level security;
alter table role_branches enable row level security;
alter table profile_branches enable row level security;
alter table cities enable row level security;
alter table branches enable row level security;
alter table client_tasks enable row level security;
alter table demand_sources enable row level security;
alter table lead_sources enable row level security;
alter table funnel_stages enable row level security;
alter table display_settings enable row level security;
alter table audit_log enable row level security;

-- Read: any authenticated user.
do $$
declare t text;
begin
  foreach t in array array[
    'roles','profiles','role_branches','profile_branches','cities','branches',
    'client_tasks','demand_sources','lead_sources','funnel_stages','display_settings','audit_log'
  ]
  loop
    execute format(
      'create policy %I_read on %I for select to authenticated using (true)',
      t, t
    );
  end loop;
end $$;

-- Write (insert/update/delete): requires the 'settings' capability.
do $$
declare t text;
begin
  foreach t in array array[
    'roles','profiles','role_branches','profile_branches','cities','branches',
    'client_tasks','demand_sources','lead_sources','funnel_stages','display_settings','audit_log'
  ]
  loop
    execute format(
      'create policy %I_write on %I for all to authenticated using (has_cap(''settings'')) with check (has_cap(''settings''))',
      t, t
    );
  end loop;
end $$;
