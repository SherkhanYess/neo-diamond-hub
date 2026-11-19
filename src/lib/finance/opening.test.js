import { describe, it, expect } from 'vitest'
import { openingFor, monthStart, nextMonth } from './opening.js'

const anchor = { date: '2026-09-01', amount: 19872188.03 }
const flows = { '2026-09-01|2026-10-01': -6202907.32, '2026-08-01|2026-09-01': 7652351.48 }
const flow = async (a, b) => flows[`${a}|${b}`] ?? 0

describe('остаток на начало месяца', () => {
  it('месяц опорной точки — сама точка', async () => {
    expect(await openingFor('2026-09', anchor, flow)).toBe(19872188.03)
  })
  it('после точки — плюс движение', async () => {
    expect(await openingFor('2026-10', anchor, flow)).toBeCloseTo(13669280.71, 2)
  })
  it('до точки — минус движение', async () => {
    expect(await openingFor('2026-08', anchor, flow)).toBeCloseTo(12219836.55, 2)
  })
  it('даты месяца', () => {
    expect(monthStart('2026-09')).toBe('2026-09-01')
    expect(nextMonth('2026-12')).toBe('2027-01')
  })
})
