-- Demo deal cohort for Алматы, Sept 2026. Idempotent-ish: clears prior demo deals first.
do $$
declare
  v_branch uuid;
  v_task uuid;
  v_perf uuid;
  v_content uuid;
  s_obr uuid; s_qual uuid; s_mset uuid; s_mheld uuid; s_sale uuid;
  d_id uuid;
  i int;
  base date := date '2026-09-01';
  cday date;
  max_tier int;
  src uuid;
  rev numeric;
  cyc int;
begin
  select id into v_branch from branches where name = 'Алматы — Центральный' limit 1;
  select id into v_task from client_tasks where name = 'Сделать предложение руки и сердца' limit 1;
  select id into v_perf from demand_sources where name = 'Performance' limit 1;
  select id into v_content from demand_sources where name = 'Контент' limit 1;
  select id into s_obr from funnel_stages where sort_order = 1;
  select id into s_qual from funnel_stages where sort_order = 2;
  select id into s_mset from funnel_stages where sort_order = 3;
  select id into s_mheld from funnel_stages where sort_order = 4;
  select id into s_sale from funnel_stages where sort_order = 5;

  delete from deals where branch_id = v_branch and crm_id like 'demo-%';

  -- tiers: (max stage reached, how many deals)
  -- 1=обращение only(20), 2=квал(10), 3=встреча назн(5), 4=встреча сост(10), 5=продажа(15)
  for i in 1..60 loop
    if i <= 20 then max_tier := 1;
    elsif i <= 30 then max_tier := 2;
    elsif i <= 35 then max_tier := 3;
    elsif i <= 45 then max_tier := 4;
    else max_tier := 5;
    end if;

    cday := base + ((i % 26))::int;               -- spread across the month
    src := case when (i % 3) = 0 then v_content else v_perf end;
    rev := case when src = v_content then 800000 else 600000 end;
    cyc := 5 + (i % 16);                           -- 5..20 days

    insert into deals (crm_id, branch_id, client_task_id, demand_source_id, created_at,
                       current_stage_id, revenue, sale_at)
    values (
      'demo-' || i,
      v_branch,
      case when max_tier >= 2 then v_task else null end,          -- task known once qualified
      case when max_tier >= 4 then src else null end,             -- first touch known at "встреча состоялась"
      cday,
      case max_tier when 1 then s_obr when 2 then s_qual when 3 then s_mset when 4 then s_mheld else s_sale end,
      case when max_tier = 5 then rev else null end,
      case when max_tier = 5 then (cday + cyc)::timestamptz else null end
    ) returning id into d_id;

    insert into deal_stage_events (deal_id, stage_id, entered_at) values (d_id, s_obr, cday);
    if max_tier >= 2 then insert into deal_stage_events (deal_id, stage_id, entered_at) values (d_id, s_qual, cday + 1); end if;
    if max_tier >= 3 then insert into deal_stage_events (deal_id, stage_id, entered_at) values (d_id, s_mset, cday + 2); end if;
    if max_tier >= 4 then insert into deal_stage_events (deal_id, stage_id, entered_at) values (d_id, s_mheld, cday + 3); end if;
    if max_tier >= 5 then insert into deal_stage_events (deal_id, stage_id, entered_at) values (d_id, s_sale, cday + cyc); end if;
  end loop;
end $$;

select
  (select count(*) from deals where crm_id like 'demo-%') as deals,
  (select count(*) from deals where crm_id like 'demo-%' and sale_at is not null) as won,
  (select count(*) from deal_stage_events e join deals d on d.id=e.deal_id where d.crm_id like 'demo-%') as events;
