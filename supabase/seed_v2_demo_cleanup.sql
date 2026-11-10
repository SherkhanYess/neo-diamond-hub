-- Removes every v2 demo row. Real data and configuration stay untouched.
delete from deals where crm_id like 'v2demo-%';
delete from ad_entities where name like 'v2demo · %';
delete from spend_entries where name like 'v2demo %';
delete from plans where computed ->> 'demo' = 'true';
select 'v2 demo removed' as result;
