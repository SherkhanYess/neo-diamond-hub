// Capabilities and how they map to navigation. The DB (RLS) is the real barrier;
// this module only decides what the current user is shown.

export const CAPS = [
  { key: 'view_reports', label: 'Смотреть отчёты' },
  { key: 'enter_fact', label: 'Вводить факт' },
  { key: 'edit_plan', label: 'Редактировать план' },
  { key: 'approve_plan', label: 'Утверждать план' },
  { key: 'decisions', label: 'Журнал решений' },
  { key: 'settings', label: 'Настройки' },
]

export const CAP_KEYS = CAPS.map((c) => c.key)

export function can(caps, cap) {
  return Array.isArray(caps) && caps.includes(cap)
}

// Menu items in display order. `cap` is the capability required to see the item.
export const MENU_ITEMS = [
  { key: 'dashboard', label: 'Рабочий стол', path: '/', cap: 'view_reports' },
  { key: 'planning', label: 'Планирование', path: '/planning', cap: 'edit_plan' },
  { key: 'marketing', label: 'Маркетинг', path: '/marketing', cap: 'view_reports' },
  { key: 'sales', label: 'Продажи', path: '/sales', cap: 'view_reports' },
  { key: 'taplink', label: 'Таплинк', path: '/taplink', cap: 'view_reports' },
  { key: 'decisions', label: 'Журнал решений', path: '/decisions', cap: 'decisions' },
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
