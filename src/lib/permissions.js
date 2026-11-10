// Capabilities and how they map to navigation. The DB (RLS) is the real barrier;
// this module only decides what the current user is shown.

export const CAPS = [
  { key: 'view_reports', label: 'Смотреть отчёты' },
  { key: 'enter_fact', label: 'Вводить факт' },
  { key: 'edit_plan', label: 'Редактировать план' },
  { key: 'approve_plan', label: 'Утверждать план' },
  { key: 'decisions', label: 'Журнал решений' },
  { key: 'settings', label: 'Настройки' },
  { key: 'all_brands', label: 'Все бренды' },
  { key: 'sales_all', label: 'Отдел продаж: весь' },
  { key: 'sales_unit', label: 'Отдел продаж: свой подотдел' },
  { key: 'sales_self', label: 'Отдел продаж: только себя' },
]

export const SALES_CAPS = ['view_reports', 'sales_all', 'sales_unit', 'sales_self']

export const CAP_KEYS = CAPS.map((c) => c.key)

// cap may be a single key or a list (any of them grants access).
export function can(caps, cap) {
  if (!Array.isArray(caps)) return false
  return Array.isArray(cap) ? cap.some((c) => caps.includes(c)) : caps.includes(cap)
}

// Which people a user may see in Отдел продаж: 'all' | 'unit' | 'self'.
export function salesScope(caps) {
  if (can(caps, ['sales_all', 'settings'])) return 'all'
  if (can(caps, 'sales_unit')) return 'unit'
  if (can(caps, 'sales_self')) return 'self'
  return can(caps, 'view_reports') ? 'all' : null
}

// Menu items in display order. `cap` is the capability required to see the item.
export const MENU_ITEMS = [
  { key: 'dashboard', label: 'Рабочий стол', path: '/', cap: 'view_reports' },
  { key: 'commerce', label: 'Коммерция', path: '/commerce', cap: 'view_reports' },
  { key: 'marketing', label: 'Маркетинг', path: '/marketing', cap: 'view_reports' },
  { key: 'sales', label: 'Отдел продаж', path: '/sales', cap: SALES_CAPS },
  { key: 'planning', label: 'Планирование', path: '/planning', cap: ['edit_plan', 'approve_plan', 'sales_all'] },
  { key: 'decisions', label: 'Журнал решений', path: '/decisions', cap: 'decisions' },
  { key: 'reference', label: 'Справочник', path: '/reference', cap: 'view_reports' },
]

export const SETTINGS_ITEM = {
  key: 'settings',
  label: 'Настройки',
  path: '/settings',
  cap: 'settings',
}

export function visibleMenuItems(caps) {
  return MENU_ITEMS.filter((item) => can(caps, item.cap))
}
