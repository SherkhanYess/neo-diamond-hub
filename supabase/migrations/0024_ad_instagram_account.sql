-- На какой Instagram-профиль ведёт объявление (creative.instagram_user_id):
-- переходы в профиль из рекламы считаются по профилю, а не по кабинету.
alter table ad_entities add column if not exists ig_user_id text;

update integrations
   set config = jsonb_set(config, '{instagram,17841415622158308}', '{"brand":"taena","username":"taena.kz"}'::jsonb)
 where key = 'meta';
