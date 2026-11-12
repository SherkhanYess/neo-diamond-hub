// Config-driven definitions for simple dictionary sections (see CrudSection).
import { money } from '../../../lib/format'

export const SEGMENTS = ['Помолвка', 'Свадьба', 'Подарок', 'Для себя', 'Значимое событие']

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
  select: 'id, name, sort_order, is_archived, created_at, city_id, city:cities(id, name)',
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
  select: 'id, name, sort_order, is_archived, created_at, default_owner_id, default_owner:profiles(id, full_name)',
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

export const TAG_CATEGORIES = ['Формат', 'Хук', 'Лицо в кадре', 'Оффер', 'Задуманная задача']

export const creativeTagsConfig = {
  table: 'creative_tags',
  title: 'Теги креативов',
  singular: 'Тег',
  columns: [
    { key: 'name', label: 'Тег' },
    { key: 'category', label: 'Категория' },
  ],
  fields: [
    { key: 'name', label: 'Тег', type: 'text', required: true },
    { key: 'category', label: 'Категория', type: 'select', options: TAG_CATEGORIES },
  ],
}

export const brandsConfig = {
  table: 'brands',
  title: 'Бренды',
  singular: 'Бренд',
  intro:
    'Свои у бренда: клиентские задачи, источники спроса, конвертеры, рекламные кабинеты, планы коммерции и маркетинга. Общее: пользователи, филиалы, отдел продаж, воронка.',
  columns: [
    { key: 'name', label: 'Бренд' },
    { key: 'slug', label: 'Код' },
  ],
  fields: [
    { key: 'name', label: 'Название', type: 'text', required: true },
    { key: 'slug', label: 'Код (латиницей)', type: 'text', required: true, hint: 'Например neodiamond, taena' },
  ],
}

export const ENTRY_SOURCES = [
  { value: 'taplink', label: 'Таплинк (link.neodiamond.kz)' },
  { value: 'site', label: 'Сайт-каталог (события сайта)' },
  { value: 'ads', label: 'Клики рекламы' },
  { value: 'instagram', label: 'Переходы в профиль Instagram' },
  { value: 'none', label: 'Нет данных о кликах' },
]

const entryLabel = (v) => ENTRY_SOURCES.find((e) => e.value === v)?.label ?? '—'

export const convertersConfig = {
  table: 'converters',
  title: 'Конвертеры',
  singular: 'Конвертер',
  intro:
    'Конвертер — где источник превращает человека в лид: профиль (bio, сторис), сайт-каталог, реклама сразу в WhatsApp. Принадлежит источнику спроса; какой лид пришёл через какой конвертер — решают UTM-правила.',
  select: 'id, name, sort_order, is_archived, created_at, brand_id, demand_source_id, entry_source, source:demand_sources(id, name)',
  rowLabel: (r) => `${r.source?.name ?? '—'} · ${r.name}`,
  sortRows: (rows) =>
    rows.sort((a, b) => (a.source?.name ?? '').localeCompare(b.source?.name ?? '') || a.sort_order - b.sort_order),
  columns: [
    { key: 'source', label: 'Источник', render: (r) => r.source?.name ?? '—' },
    { key: 'name', label: 'Конвертер' },
    { key: 'entry_source', label: 'Клики воронки', render: (r) => entryLabel(r.entry_source) },
  ],
  fields: [
    { key: 'demand_source_id', label: 'Источник спроса', type: 'select', optionsFrom: 'demand_sources', required: true },
    { key: 'name', label: 'Название', type: 'text', required: true },
    { key: 'entry_source', label: 'Откуда брать клики воронки', type: 'select', options: ENTRY_SOURCES, required: true },
  ],
}

const pattern = (v) => (v == null || v === '' ? '*' : v)

export const utmRulesConfig = {
  table: 'utm_rules',
  title: 'UTM-правила',
  singular: 'Правило',
  select:
    'id, name, sort_order, is_archived, created_at, brand_id, converter_id, match_source, match_medium, match_campaign, match_content, priority, converter:converters(id, name, source:demand_sources(name))',
  sortRows: (rows) => rows.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name)),
  columns: [
    { key: 'priority', label: '№', numeric: true },
    { key: 'name', label: 'Правило' },
    {
      key: 'cond',
      label: 'Условие',
      render: (r) => `source=${pattern(r.match_source)} · medium=${pattern(r.match_medium)} · campaign=${pattern(r.match_campaign)}`,
    },
    {
      key: 'converter',
      label: '→ Источник · конвертер',
      render: (r) => (r.converter ? `${r.converter.source?.name ?? '—'} · ${r.converter.name}` : '—'),
    },
  ],
  fields: [
    { key: 'name', label: 'Название правила', type: 'text', required: true },
    {
      key: 'converter_id',
      label: 'Конвертер (и источник)',
      type: 'select',
      optionsFrom: 'converters',
      optionsSelect: 'id, name, brand_id, source:demand_sources(name)',
      optionLabel: (r) => `${r.source?.name ?? '—'} · ${r.name}`,
      required: true,
    },
    { key: 'match_source', label: 'utm_source', type: 'text', optional: true, placeholder: 'instagram', hint: 'Пусто = любое значение. * — шаблон: bio*' },
    { key: 'match_medium', label: 'utm_medium', type: 'text', optional: true, placeholder: 'bio*' },
    { key: 'match_campaign', label: 'utm_campaign', type: 'text', optional: true },
    { key: 'match_content', label: 'utm_content', type: 'text', optional: true },
    { key: 'priority', label: 'Приоритет', type: 'number', default: 100, hint: 'Меньше — проверяется раньше. Общие правила (пустые поля) ставьте с большим номером.' },
  ],
}

export const spendConfig = {
  table: 'spend_entries',
  title: 'Расходы',
  singular: 'Расход',
  intro:
    'Ручной расход для источников без рекламного кабинета (2ГИС, эфиры, инфлюенсеры…). Расход Meta и TikTok приходит из кабинетов по дням. Вложения источника = кабинеты + ручной расход.',
  uniqueName: false,
  nameRequired: false,
  select:
    'id, name, sort_order, is_archived, created_at, brand_id, spent_on, amount, demand_source_id, converter_id, source:demand_sources(name), converter:converters(name)',
  rowLabel: (r) => `${r.spent_on} · ${r.source?.name ?? '—'} · ${money(r.amount)}`,
  sortRows: (rows) => rows.sort((a, b) => (b.spent_on || '').localeCompare(a.spent_on || '')),
  columns: [
    { key: 'spent_on', label: 'Дата' },
    { key: 'source', label: 'Источник', render: (r) => r.source?.name ?? '—' },
    { key: 'converter', label: 'Конвертер', render: (r) => r.converter?.name ?? '—' },
    { key: 'amount', label: 'Сумма', numeric: true, render: (r) => money(r.amount) },
    { key: 'name', label: 'Комментарий' },
  ],
  fields: [
    { key: 'spent_on', label: 'Дата', type: 'date', required: true },
    { key: 'demand_source_id', label: 'Источник спроса', type: 'select', optionsFrom: 'demand_sources', required: true },
    {
      key: 'converter_id',
      label: 'Конвертер (необязательно)',
      type: 'select',
      optionsFrom: 'converters',
      optionsSelect: 'id, name, brand_id, source:demand_sources(name)',
      optionLabel: (r) => `${r.source?.name ?? '—'} · ${r.name}`,
      optional: true,
    },
    { key: 'amount', label: 'Сумма, ₸', type: 'number', required: true },
    { key: 'name', label: 'Комментарий', type: 'text', optional: true },
  ],
}
