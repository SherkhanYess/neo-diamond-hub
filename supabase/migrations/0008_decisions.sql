-- 0008_decisions.sql
-- Decision journal: closes the loop task → execution → effect check.

create table decisions (
  id uuid primary key default gen_random_uuid(),
  decision_type text not null check (decision_type in ('scale', 'keep', 'change', 'stop')),
  slice jsonb not null default '{}',        -- inherited filters (task, source, lead, branch)
  hypothesis text not null default '',
  metric_name text not null default '',
  metric_target numeric,
  owner_id uuid references profiles (id),
  check_date date,
  outcome text check (outcome in ('worked', 'failed', 'partial')),
  outcome_comment text,
  metric_before numeric,
  metric_after numeric,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index decisions_check_idx on decisions (check_date, outcome);

alter table decisions enable row level security;

-- Read: decisions capability (or settings).
create policy decisions_read on decisions for select to authenticated
  using (has_cap('decisions') or has_cap('settings'));

-- Write: decisions capability (or settings).
create policy decisions_write on decisions for all to authenticated
  using (has_cap('decisions') or has_cap('settings'))
  with check (has_cap('decisions') or has_cap('settings'));
