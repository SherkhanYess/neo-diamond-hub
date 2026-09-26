import { describe, it, expect } from 'vitest'
import { canDelete, validateFunnelFlags, validateUniqueName } from './referenceRules'

describe('canDelete', () => {
  it('allows delete when nothing uses the item (phase 1 default)', () => {
    expect(canDelete(() => false, 'cities', 'x')).toBe(true)
  })
  it('blocks delete when the item is in use', () => {
    expect(canDelete(() => true, 'cities', 'x')).toBe(false)
  })
  it('allows delete when no checker is provided', () => {
    expect(canDelete(undefined, 'cities', 'x')).toBe(true)
  })
})

describe('validateFunnelFlags', () => {
  const base = [
    { name: 'Обращение', is_qualification: false, is_sale: false },
    { name: 'Квал', is_qualification: true, is_sale: false },
    { name: 'Продажа', is_qualification: false, is_sale: true },
  ]
  it('passes with exactly one qualification and one sale', () => {
    expect(validateFunnelFlags(base).valid).toBe(true)
  })
  it('fails with two qualification stages', () => {
    const bad = [...base, { name: 'X', is_qualification: true, is_sale: false }]
    expect(validateFunnelFlags(bad).valid).toBe(false)
  })
  it('ignores archived stages', () => {
    const withArchived = [...base, { name: 'Old', is_qualification: true, is_sale: false, is_archived: true }]
    expect(validateFunnelFlags(withArchived).valid).toBe(true)
  })
})

describe('validateUniqueName', () => {
  const rows = [{ id: '1', name: 'Алматы', is_archived: false }]
  it('rejects empty', () => {
    expect(validateUniqueName(rows, '   ').valid).toBe(false)
  })
  it('rejects duplicate (case-insensitive)', () => {
    expect(validateUniqueName(rows, 'алматы').valid).toBe(false)
  })
  it('accepts a new unique name', () => {
    expect(validateUniqueName(rows, 'Астана').valid).toBe(true)
  })
  it('accepts editing the same row', () => {
    expect(validateUniqueName(rows, 'Алматы', '1').valid).toBe(true)
  })
})
