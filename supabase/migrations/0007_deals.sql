-- 0007_deals.sql
-- CRM deals + per-stage entry events. Populated by the amoCRM sync (later);
-- fields mirror what the sync will write.

create table deals (
  id uuid primary key default gen_random_uuid(),
  crm_id text,
  branch_id uuid references branches (id),
  client_task_id uuid references client_tasks (id),   -- null until qualified
  lead_source_id uuid references lead_sources (id),
  demand_source_id uuid references demand_sources (id), -- null until "Встреча состоялась"
  manager_id uuid references profiles (id),
  created_at timestamptz not null default now(),        -- обращение date
  current_stage_id uuid references funnel_stages (id),
  revenue numeric,                                      -- full deal sum, null until sale
  sale_at timestamptz,                                  -- предоплата / продажа date
  receive_date date,                                    -- срок получения
  is_ignored boolean not null default false,
  lost_reason text,
  ad_id text
);

create index deals_cohort_idx on deals (branch_id, created_at);

create table deal_stage_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals (id) on delete cascade,
  stage_id uuid not null references funnel_stages (id),
  entered_at timestamptz not null default now(),
  unique (deal_id, stage_id)
);

alter table deals enable row level security;
alter table deal_stage_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['deals','deal_stage_events']
  loop
    execute format(
      'create policy %I_read on %I for select to authenticated using (
         has_cap(''view_reports'') or has_cap(''edit_plan'') or has_cap(''approve_plan'') or has_cap(''settings'')
       )', t, t);
    -- Writes (sync/manual fixes) require enter_fact or settings.
    execute format(
      'create policy %I_write on %I for all to authenticated
         using (has_cap(''enter_fact'') or has_cap(''settings''))
         with check (has_cap(''enter_fact'') or has_cap(''settings''))', t, t);
  end loop;
end $$;
