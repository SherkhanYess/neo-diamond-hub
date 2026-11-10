-- seed_v2_plans_people.sql — November 2026 demo: unit membership, marketing
-- plan by converter, sales-department plan with unit and personal targets.
-- Plans are tagged computed.demo = true (cleanup script removes them).
-- Deliberate mismatches to exercise the top-down reconciliation:
--   ND TikTok converters plan 300 000 vs source budget 371 500 in Коммерция;
--   Консультации unit target 82 sales vs personal targets 40 + 40.
do $$
declare
  nd uuid := '20000000-0000-0000-0000-000000000001';
  ta uuid := '20000000-0000-0000-0000-000000000002';
  p_almas uuid := '6f40513b-f486-4775-8b60-baabb29fc85f';
  p_abylai uuid := '79950e02-140b-4d1b-bcde-cbff47578bbd';
  p_danelya uuid := 'be193113-4acc-4aae-8b02-b6b7d5b000c6';
  owner uuid;
  u_lead uuid; u_cons uuid; u_acc uuid;
  sp uuid;
begin
  select p.id into owner from profiles p join roles r on r.id = p.role_id where r.is_system limit 1;
  select id into u_lead from sales_units where kind = 'lead_center' limit 1;
  select id into u_cons from sales_units where kind = 'consultations' limit 1;
  select id into u_acc  from sales_units where kind = 'account' limit 1;

  -- unit membership (configuration; editable in Settings → Подотделы)
  insert into sales_unit_members (unit_id, profile_id) values
    (u_lead, p_almas), (u_lead, p_abylai), (u_cons, p_danelya), (u_cons, p_abylai), (u_acc, p_danelya)
  on conflict do nothing;

  delete from plans where computed ->> 'demo' = 'true' and kind in ('marketing', 'sales');

  -- marketing plans by converter (per brand, no branch)
  insert into plans (month, branch_id, brand_id, kind, version, status, computed, created_by, approved_by, approved_at)
  values ('2026-11-01', null, nd, 'marketing', 1, 'approved', '{"demo": true}', owner, owner, now()),
         ('2026-11-01', null, ta, 'marketing', 1, 'approved', '{"demo": true}', owner, owner, now());

  insert into plan_converter_lines (plan_id, converter_id, budget, leads, quals)
  select p.id, c.id, v.budget, v.leads, v.quals
  from (values
    (nd, 'Instagram', 'Профиль (bio, сторис)',          0, 140, 100),
    (nd, 'Instagram', 'Сайт-каталог',             1200000,  60,  36),
    (nd, 'Instagram', 'Реклама → WhatsApp',       1464000, 120,  78),
    (nd, '2ГИС',      'Карточка 2ГИС',             700000,  48,  38),
    (nd, '2ГИС',      'Сайт-каталог',              393500,  24,  17),
    (nd, 'TikTok',    'Эфир',                      150000,  30,  15),
    (nd, 'TikTok',    'Реклама',                   150000,  36,  12),
    (ta, 'Instagram', 'Профиль (bio, сторис)',          0,  55,  40),
    (ta, 'Instagram', 'Сайт-каталог',              400000,  36,  22),
    (ta, 'Instagram', 'Реклама → WhatsApp',        675000,  72,  33),
    (ta, '2ГИС',      'Карточка 2ГИС',             325000,  24,  18)
  ) v(brand, src, conv, budget, leads, quals)
  join demand_sources ds on ds.brand_id = v.brand and ds.name = v.src
  join converters c on c.demand_source_id = ds.id and c.name = v.conv
  join plans p on p.brand_id = v.brand and p.kind = 'marketing' and p.month = '2026-11-01' and p.computed ->> 'demo' = 'true';

  -- sales-department plan (shared by both brands, all branches)
  insert into plans (month, branch_id, brand_id, kind, version, status, computed, created_by, approved_by, approved_at)
  values ('2026-11-01', null, null, 'sales', 1, 'approved', '{"demo": true}', owner, owner, now())
  returning id into sp;

  insert into plan_sales_targets (plan_id, unit_id, profile_id, metric, value) values
    (sp, null,   null,      'sales',          96),
    (sp, null,   null,      'revenue',     62000000),
    (sp, u_lead, null,      'held',           125),
    (sp, u_lead, p_almas,   'held',            70),
    (sp, u_lead, p_almas,   'quals',          160),
    (sp, u_lead, p_almas,   'set',            110),
    (sp, u_lead, p_abylai,  'held',            55),
    (sp, u_lead, p_abylai,  'quals',          130),
    (sp, u_lead, p_abylai,  'set',             90),
    (sp, u_cons, null,      'sales',           82),
    (sp, u_cons, p_danelya, 'sales',           40),
    (sp, u_cons, p_danelya, 'revenue',     28000000),
    (sp, u_cons, p_danelya, 'held',            85),
    (sp, u_cons, p_abylai,  'sales',           40),
    (sp, u_cons, p_abylai,  'revenue',     26000000),
    (sp, u_cons, p_abylai,  'held',            80),
    (sp, u_acc,  null,      'repeat_sales',    12),
    (sp, u_acc,  p_danelya, 'repeat_sales',    12),
    (sp, u_acc,  p_danelya, 'repeat_revenue', 6000000);
end $$;

select p.kind, b.name brand,
       (select count(*) from plan_converter_lines l where l.plan_id = p.id) converter_lines,
       (select count(*) from plan_sales_targets t where t.plan_id = p.id) targets
from plans p left join brands b on b.id = p.brand_id
where p.month = '2026-11-01' and p.kind in ('marketing', 'sales') order by p.kind, b.name;
