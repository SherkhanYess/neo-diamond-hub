// Config-driven definitions for simple dictionary sections.
// Each: { table, title, singular, columns, fields }
// field: { key, label, type: 'text'|'number'|'select', options?, optionsFrom? }

export const SEGMENTS = ['Помолвка', 'Подарок', 'Для себя', 'Значимое событие']

export const citiesConfig = {
  table: 'cities',
  title: 'Города',
  singular: 'Город',
  columns: [{ key: 'name', label: 'Название' }],
  fields: [{ key: 'name', label: 'Название', type: 'text', required: true }],
}

export const branchesConfig = {
  table: 'branches',
  title: 'Филиалы',
  singular: 'Филиал',
  columns: [
    { key: 'name', label: 'Название' },
    { key: 'city_name', label: 'Город', render: (r) => r.city?.name ?? '—' },
  ],
  select: 'id, name, sort_order, is_archived, created_at, city:cities(id, name)',
  fields: [
    { key: 'name', label: 'Название', type: 'text', required: true },
    { key: 'city_id', label: 'Город', type: 'select', optionsFrom: 'cities' },
  ],
}

export const clientTasksConfig = {
  table: 'client_tasks',
  title: 'Клиентские задачи',
  singular: 'Задача',
  columns: [
    { key: 'name', label: 'Задача' },
    { key: 'segment', label: 'Свёртка' },
  ],
  fields: [
    { key: 'name', label: 'Задача', type: 'text', required: true },
    { key: 'segment', label: 'Свёртка', type: 'select', options: SEGMENTS },
  ],
}

export const demandSourcesConfig = {
  table: 'demand_sources',
  title: 'Источники спроса',
  singular: 'Источник',
  columns: [
    { key: 'name', label: 'Источник' },
    { key: 'owner', label: 'Ответственный', render: (r) => r.default_owner?.full_name ?? '—' },
  ],
  select: 'id, name, sort_order, is_archived, created_at, default_owner:profiles(id, full_name)',
  fields: [
    { key: 'name', label: 'Название', type: 'text', required: true },
    { key: 'default_owner_id', label: 'Ответственный по умолчанию', type: 'select', optionsFrom: 'profiles', optional: true },
  ],
}

export const leadSourcesConfig = {
  table: 'lead_sources',
  title: 'Источники лида',
  singular: 'Источник лида',
  columns: [{ key: 'name', label: 'Название' }],
  fields: [{ key: 'name', label: 'Название', type: 'text', required: true }],
}
