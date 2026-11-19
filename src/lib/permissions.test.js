import { describe, it, expect } from 'vitest'
import { can, visibleMenuItems, CAP_KEYS, SETTINGS_ITEM, canSettingsSection } from './permissions'

describe('can', () => {
  it('returns true when the cap is present', () => {
    expect(can(['settings', 'view_reports'], 'settings')).toBe(true)
  })
  it('returns false when the cap is missing', () => {
    expect(can(['view_reports'], 'settings')).toBe(false)
  })
  it('is safe with non-array input', () => {
    expect(can(null, 'settings')).toBe(false)
    expect(can(undefined, 'view_reports')).toBe(false)
  })
})

describe('visibleMenuItems', () => {
  it('shows nothing for empty caps', () => {
    expect(visibleMenuItems([])).toEqual([])
  })
  it('shows only reports-gated items for a viewer', () => {
    const keys = visibleMenuItems(['view_reports']).map((i) => i.key)
    expect(keys).toContain('dashboard')
    expect(keys).toContain('marketing')
    expect(keys).toContain('sales')
    expect(keys).toContain('commerce')
    expect(keys).toContain('reference')
    expect(keys).not.toContain('planning')
    expect(keys).not.toContain('decisions')
  })
  it('shows planning for a plan editor', () => {
    const keys = visibleMenuItems(['edit_plan']).map((i) => i.key)
    expect(keys).toEqual(['planning'])
  })
  it('shows everything for an owner with all caps', () => {
    const keys = visibleMenuItems(CAP_KEYS).map((i) => i.key)
    expect(keys).toEqual(['dashboard', 'commerce', 'marketing', 'sales', 'planning', 'finance', 'decisions', 'reference'])
  })
})

describe('право «Финансы»', () => {
  it('видит вкладку и настройки, но в настройках — только свой раздел', () => {
    expect(visibleMenuItems(['finance']).map((i) => i.key)).toEqual(['finance'])
    expect(can(['finance'], SETTINGS_ITEM.cap)).toBe(true)
    expect(canSettingsSection(['finance'], { key: 'fin_rules', cap: 'finance' })).toBe(true)
    expect(canSettingsSection(['finance'], { key: 'users' })).toBe(false)
    expect(canSettingsSection(['settings'], { key: 'users' })).toBe(true)
    expect(canSettingsSection(['settings'], { key: 'fin_rules', cap: 'finance' })).toBe(false)
  })
})
