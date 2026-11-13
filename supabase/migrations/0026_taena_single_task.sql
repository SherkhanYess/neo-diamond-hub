-- taena: одна задача клиента — «Сделать предложение» (решение владельца 14.11.2026), повод в amoCRM её не меняет.
update integrations set config = jsonb_set(config, '{brand_task}', '{"taena":"Сделать предложение"}'::jsonb) where key='amocrm';
