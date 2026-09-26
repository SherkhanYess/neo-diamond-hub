do $$
declare
  v_camp uuid; v_group uuid; a1 uuid; a2 uuid; a3 uuid;
  v_perf uuid;
begin
  select id into v_perf from demand_sources where name='Performance' limit 1;

  delete from ad_entities where external_id like 'demo-%';

  insert into ad_entities (cabinet, level, external_id, name, spend, impressions, clicks)
    values ('meta','campaign','demo-camp','PRED_meta_gift_0926', 0, 0, 0) returning id into v_camp;
  insert into ad_entities (cabinet, level, parent_id, external_id, name, spend, impressions, clicks)
    values ('meta','group', v_camp, 'demo-grp','Группа UGC', 0, 0, 0) returning id into v_group;
  insert into ad_entities (cabinet, level, parent_id, external_id, name, spend, impressions, clicks, preview_url)
    values ('meta','ad', v_group, 'ad-1','UGC · рилс · оффер', 450000, 120000, 2400, null) returning id into a1;
  insert into ad_entities (cabinet, level, parent_id, external_id, name, spend, impressions, clicks, preview_url)
    values ('meta','ad', v_group, 'ad-2','Студийная съёмка', 300000, 80000, 1200, null) returning id into a2;
  insert into ad_entities (cabinet, level, parent_id, external_id, name, spend, impressions, clicks, preview_url)
    values ('meta','ad', v_group, 'ad-3','Отзыв клиента', 90000, 30000, 600, null) returning id into a3;

  -- Make all demo deals Performance; assign ad_id round-robin to demo-1..50; demo-51..60 stay without ad.
  update deals set demand_source_id = v_perf where crm_id like 'demo-%';
  update deals set ad_id = case (right(crm_id, length(crm_id)-5)::int % 3)
    when 0 then 'ad-1' when 1 then 'ad-2' else 'ad-3' end
    where crm_id like 'demo-%' and right(crm_id, length(crm_id)-5)::int <= 50;
  update deals set ad_id = null where crm_id like 'demo-%' and right(crm_id, length(crm_id)-5)::int > 50;
  -- A few ignored leads (closed-lost "Игнор").
  update deals set is_ignored = true where crm_id like 'demo-%' and right(crm_id, length(crm_id)-5)::int <= 8;
end $$;

select
  (select count(*) from ad_entities where external_id like 'demo-%' or external_id like 'ad-%') as ad_rows,
  (select count(*) from deals where ad_id is not null and crm_id like 'demo-%') as with_ad,
  (select count(*) from deals where ad_id is null and crm_id like 'demo-%') as without_ad,
  (select count(*) from deals where is_ignored and crm_id like 'demo-%') as ignored;
