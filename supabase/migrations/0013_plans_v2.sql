-- 0013_plans_v2.sql
-- v2 phase 5 schema: top-down plans.
--   Коммерция (per brand, per branch)  → plan_task_lines / plan_source_lines (as before)
--   Маркетинг (per brand)              → plan_converter_lines: budget, leads, quals per converter
--   Отдел продаж (shared, no branch)    → plan_sales_targets (0012)

-- Plan kinds: commerce (brand × branch), marketing (brand), sales (department).
alter table plans drop constraint if exists plans_kind_chk;
alter table plans add constraint plans_kind_chk check (kind in ('commerce', 'marketing', 'sales'));
alter table plans drop constraint if exists plans_commerce_brand_chk;
alter table plans add constraint plans_commerce_brand_chk check (kind not in ('commerce', 'marketing') or brand_id is not null);

-- Marketing and sales-department plans span all branches.
alter table plans alter column branch_id drop not null;
do $$ begin
  alter table plans add constraint plans_commerce_branch_chk check (kind <> 'commerce' or branch_id is not null);
exception when duplicate_object then null; end $$;
drop index if exists plans_scope_version_uq;
create unique index if not exists plans_scope_version_uq on plans (
  month,
  coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
  kind,
  coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
  version
);

create table if not exists plan_converter_lines (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans (id) on delete cascade,
  converter_id uuid not null references converters (id) on delete cascade,
  budget numeric not null default 0,
  leads numeric not null default 0,
  quals numeric not null default 0,
  unique (plan_id, converter_id)
);

alter table plan_converter_lines enable row level security;
drop policy if exists plan_converter_lines_read on plan_converter_lines;
create policy plan_converter_lines_read on plan_converter_lines for select to authenticated using (
  has_cap('view_reports') or has_cap('edit_plan') or has_cap('approve_plan') or has_cap('settings')
);
drop policy if exists plan_converter_lines_write on plan_converter_lines;
create policy plan_converter_lines_write on plan_converter_lines for all to authenticated
  using (has_cap('edit_plan') or has_cap('settings'))
  with check (has_cap('edit_plan') or has_cap('settings'));
