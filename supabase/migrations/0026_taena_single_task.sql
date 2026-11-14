-- taena: одна задача клиента — «Сделать предложение» (решение владельца 14.11.2026); ставится только при заполненном «Поводе покупки» (задача = квал).
update integrations set config = jsonb_set(config, '{brand_task}', '{"taena":"Сделать предложение"}'::jsonb) where key='amocrm';
