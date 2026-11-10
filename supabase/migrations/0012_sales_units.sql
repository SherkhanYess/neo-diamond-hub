-- 0012_sales_units.sql
-- v2 phase 4: sales department built from people.
-- Sub-departments (units), their members, ЦКП/metric config, personal targets,
-- and sales-scoped access (РОП → all, unit head → own unit, employee → self).

create table if not exists sales_units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- how a member's deals are attributed:
  --   lead_center  → deals.lead_manager_id   (до встречи)
  --   consultations → deals.consultant_id, not repeat (продажа)
  --   account      → deals.account_manager_id, repeat (повторная продажа)
  kind text not null default 'other' check (kind in ('lead_center', 'consultations', 'account', 'other')),
  head_profile_id uuid references profiles (id),
  kpi text[] not null default '{}',   -- metric keys; the first one is the unit's ЦКП
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists sales_unit_members (
  unit_id uuid not null references sales_units (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  primary key (unit_id, profile_id)
);

-- Personal / unit / department targets of a sales plan (plans.kind = 'sales').
create table if not exists plan_sales_targets (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans (id) on delete cascade,
  unit_id uuid references sales_units (id) on delete cascade,   -- null = whole department
  profile_id uuid references profiles (id) on delete cascade,   -- null = unit total
  metric text not null,
  value numeric not null default 0
);
create unique index if not exists plan_sales_targets_uq on plan_sales_targets (
  plan_id,
  coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid),
  metric
);

-- ------------------------------------------------------------ scope helpers
-- Profiles whose results the current user may see in Отдел продаж.
create or replace function sales_visible_profiles()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from profiles p
  where has_cap('sales_all') or has_cap('settings')
     or (not has_cap('sales_unit') and not has_cap('sales_self') and has_cap('view_reports'))
  union
  select m.profile_id from sales_unit_members m
  join sales_units u on u.id = m.unit_id
  where has_cap('sales_unit') and u.head_profile_id = auth.uid()
  union
  select auth.uid() where has_cap('sales_self') or has_cap('sales_unit')
$$;

-- Deals: report readers as before, plus sales-scoped readers for their people.
drop policy if exists deals_sales_read on deals;
create policy deals_sales_read on deals for select to authenticated using (
  (has_cap('sales_unit') or has_cap('sales_self') or has_cap('sales_all'))
  and (
    has_cap('sales_all')
    or lead_manager_id in (select sales_visible_profiles())
    or consultant_id in (select sales_visible_profiles())
    or account_manager_id in (select sales_visible_profiles())
  )
);
drop policy if exists deal_stage_events_sales_read on deal_stage_events;
create policy deal_stage_events_sales_read on deal_stage_events for select to authenticated using (
  exists (select 1 from deals d where d.id = deal_id)
);

alter table sales_units enable row level security;
alter table sales_unit_members enable row level security;
alter table plan_sales_targets enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sales_units', 'sales_unit_members']
  loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('create policy %I_read on %I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format(
      'create policy %I_write on %I for all to authenticated using (has_cap(''settings'')) with check (has_cap(''settings''))',
      t, t);
  end loop;
end $$;

drop policy if exists plan_sales_targets_read on plan_sales_targets;
create policy plan_sales_targets_read on plan_sales_targets for select to authenticated using (
  has_cap('view_reports') or has_cap('edit_plan') or has_cap('approve_plan') or has_cap('settings')
  or has_cap('sales_all') or has_cap('sales_unit') or has_cap('sales_self')
);
drop policy if exists plan_sales_targets_write on plan_sales_targets;
create policy plan_sales_targets_write on plan_sales_targets for all to authenticated
  using (has_cap('edit_plan') or has_cap('sales_all') or has_cap('settings'))
  with check (has_cap('edit_plan') or has_cap('sales_all') or has_cap('settings'));

-- Sales plans can be created by the РОП too (not only edit_plan holders).
drop policy if exists plans_write on plans;
create policy plans_write on plans for all to authenticated
  using (has_cap('edit_plan') or has_cap('approve_plan') or has_cap('settings') or (kind = 'sales' and has_cap('sales_all')))
  with check (has_cap('edit_plan') or has_cap('approve_plan') or has_cap('settings') or (kind = 'sales' and has_cap('sales_all')));
drop policy if exists plans_read on plans;
create policy plans_read on plans for select to authenticated using (
  has_cap('view_reports') or has_cap('edit_plan') or has_cap('approve_plan') or has_cap('settings')
  or (kind = 'sales' and (has_cap('sales_all') or has_cap('sales_unit') or has_cap('sales_self')))
);

-- ------------------------------------------------------------ default roles
update roles set caps = array_append(caps, 'sales_all') where is_system and not ('sales_all' = any (caps));

insert into roles (name, caps, scope_type, sort_order)
select v.n, v.c, 'all', v.o from (values
  ('РОП', array['view_reports', 'decisions', 'sales_all'], 10),
  ('Руководитель подотдела', array['sales_unit', 'decisions'], 11),
  ('Сотрудник ОП', array['sales_self'], 12)
) v(n, c, o)
where not exists (select 1 from roles r where r.name = v.n);

-- ------------------------------------------------------------ default units
insert into sales_units (name, kind, kpi, sort_order)
select v.n, v.k, v.kpi, v.o from (values
  ('Лид-центр', 'lead_center', array['held', 'quals', 'set', 'cr_lead_qual', 'cr_qual_set', 'cr_set_held', 'first_response'], 1),
  ('Консультации', 'consultations', array['sales', 'revenue', 'held', 'cr_held_sale', 'avg_check'], 2),
  ('Аккаунт-менеджеры', 'account', array['repeat_sales', 'repeat_revenue', 'avg_check'], 3)
) v(n, k, kpi, o)
where not exists (select 1 from sales_units u where u.kind = v.k);
