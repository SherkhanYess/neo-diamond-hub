-- 0006_planning.sql
-- Planning module: plans (versioned), input lines, sales conversions.

create table plans (
  id uuid primary key default gen_random_uuid(),
  month date not null,                       -- first day of the month
  branch_id uuid not null references branches (id),
  version integer not null default 1,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  reason text,                               -- required when version > 1
  branch_target_revenue numeric not null default 0,
  sales_avg_check numeric,                   -- null = weighted from marketing
  computed jsonb,                            -- snapshot written at approval
  created_by uuid references profiles (id),
  approved_by uuid references profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (month, branch_id, version)
);

create index plans_lookup_idx on plans (branch_id, month, status, version desc);

create table plan_task_lines (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans (id) on delete cascade,
  client_task_id uuid not null references client_tasks (id),
  target_revenue numeric not null default 0,
  ad_budget_pct numeric not null default 0,
  unique (plan_id, client_task_id)
);

create table plan_source_lines (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans (id) on delete cascade,
  client_task_id uuid not null references client_tasks (id),
  demand_source_id uuid not null references demand_sources (id),
  revenue_share numeric not null default 0,  -- percent within the task
  avg_check numeric not null default 0,
  ad_budget numeric,                         -- null = auto (revenue × task budget %)
  owner_id uuid references profiles (id),
  unique (plan_id, client_task_id, demand_source_id)
);

create table plan_sales_conversions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans (id) on delete cascade,
  from_stage_id uuid not null references funnel_stages (id),
  to_stage_id uuid not null references funnel_stages (id),
  rate numeric not null default 0,           -- 0..1
  unique (plan_id, from_stage_id, to_stage_id)
);

-- RLS
alter table plans enable row level security;
alter table plan_task_lines enable row level security;
alter table plan_source_lines enable row level security;
alter table plan_sales_conversions enable row level security;

-- Read: anyone who can see reports or edit/approve plans.
do $$
declare t text;
begin
  foreach t in array array['plans','plan_task_lines','plan_source_lines','plan_sales_conversions']
  loop
    execute format(
      'create policy %I_read on %I for select to authenticated using (
         has_cap(''view_reports'') or has_cap(''edit_plan'') or has_cap(''approve_plan'') or has_cap(''settings'')
       )', t, t);
  end loop;
end $$;

-- Write inputs: requires edit_plan (or settings). Line tables inherit via edit_plan.
do $$
declare t text;
begin
  foreach t in array array['plan_task_lines','plan_source_lines','plan_sales_conversions']
  loop
    execute format(
      'create policy %I_write on %I for all to authenticated
         using (has_cap(''edit_plan'') or has_cap(''settings''))
         with check (has_cap(''edit_plan'') or has_cap(''settings''))', t, t);
  end loop;
end $$;

-- plans: insert/update drafts needs edit_plan; approval (setting status/computed)
-- needs approve_plan. We keep it simple: edit_plan or approve_plan or settings may
-- write the plans row; the app enforces the draft→approved transition rule, and
-- approve_plan is checked in the app before writing computed. RLS guarantees only
-- planning-capable users touch it at all.
create policy plans_write on plans for all to authenticated
  using (has_cap('edit_plan') or has_cap('approve_plan') or has_cap('settings'))
  with check (has_cap('edit_plan') or has_cap('approve_plan') or has_cap('settings'));
