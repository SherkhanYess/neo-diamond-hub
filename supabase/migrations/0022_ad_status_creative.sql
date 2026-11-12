-- Статус РК/группы/объявления из Meta (effective_status) и креатив объявления.
alter table ad_entities
  add column if not exists status text,
  add column if not exists status_at timestamptz,
  add column if not exists thumbnail_url text,
  add column if not exists permalink text;

comment on column ad_entities.status is 'Meta effective_status: ACTIVE, PAUSED, CAMPAIGN_PAUSED, ADSET_PAUSED, ARCHIVED, DELETED, WITH_ISSUES, …';
comment on column ad_entities.thumbnail_url is 'Превью креатива (fbcdn, ссылка обновляется синхронизацией)';
comment on column ad_entities.permalink is 'Пост креатива в Instagram (instagram_permalink_url)';
comment on column ad_entities.preview_url is 'Превью объявления в Facebook (preview_shareable_link)';
