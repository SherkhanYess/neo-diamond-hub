-- 0017_direct_is_profile.sql
-- Директ без кода — это конвертер «Профиль», а не отдельный «Директ»
-- (решение владельца 11.11.2026). Правило instagram/direct ведёт в «Профиль
-- (bio, сторис)», конвертер «Директ» уходит в архив, сделки пересчитываются.

update utm_rules r
set converter_id = p.id
from converters d, converters p
where r.name = 'Код: Директ'
  and d.id = r.converter_id and d.name = 'Директ'
  and p.brand_id = d.brand_id and p.demand_source_id = d.demand_source_id
  and p.name = 'Профиль (bio, сторис)' and not p.is_archived;

update deals set converter_id = null
where converter_id in (select id from converters where name = 'Директ');

update converters set is_archived = true where name = 'Директ';
