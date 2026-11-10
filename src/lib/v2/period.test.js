import { describe, it, expect } from 'vitest'
import { presetPeriod, monthPeriod, periodDays, periodMonths, periodPace, periodBounds, periodLabel, scalePlan, presetOf } from './period'

const now = new Date(2026, 10, 11, 12) // 11 ноября 2026

describe('period', () => {
  it('пресеты', () => {
    expect(presetPeriod('today', now)).toEqual({ from: '2026-11-11', to: '2026-11-11' })
    expect(presetPeriod('yesterday', now)).toEqual({ from: '2026-11-10', to: '2026-11-10' })
    expect(presetPeriod('last7', now)).toEqual({ from: '2026-11-05', to: '2026-11-11' })
    expect(presetPeriod('thisMonth', now)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(presetPeriod('lastMonth', now)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(presetOf({ from: '2026-11-01', to: '2026-11-30' }, now)).toBe('thisMonth')
    expect(presetOf({ from: '2026-11-02', to: '2026-11-03' }, now)).toBeNull()
  })
  it('дни, недели и границы запроса', () => {
    const d = periodDays({ from: '2026-10-30', to: '2026-11-08' })
    expect(d).toHaveLength(10)
    expect(d[7]).toMatchObject({ key: '2026-11-06', week: 2 })
    expect(periodBounds({ from: '2026-11-01', to: '2026-11-30' })).toEqual({ start: '2026-11-01', end: '2026-12-01' })
  })
  it('доля плана по месяцам', () => {
    expect(periodMonths({ from: '2026-11-01', to: '2026-11-15' })).toEqual([{ month: '2026-11-01', days: 15, factor: 0.5 }])
    const two = periodMonths({ from: '2026-10-31', to: '2026-11-01' })
    expect(two.map((m) => m.month)).toEqual(['2026-10-01', '2026-11-01'])
    expect(two[0].factor).toBeCloseTo(1 / 31)
    expect(periodMonths(monthPeriod('2026-11-01'))[0].factor).toBe(1)
  })
  it('темп', () => {
    expect(periodPace({ from: '2026-11-01', to: '2026-11-30' }, now)).toBeCloseTo(11 / 30)
    expect(periodPace({ from: '2026-10-01', to: '2026-10-31' }, now)).toBe(1)
    expect(periodPace({ from: '2026-12-01', to: '2026-12-31' }, now)).toBe(0)
  })
  it('подпись', () => {
    expect(periodLabel({ from: '2026-11-01', to: '2026-11-15' })).toBe('1–15 ноября')
    expect(periodLabel({ from: '2026-11-11', to: '2026-11-11' })).toBe('11 ноября')
  })
  it('план делится по дням, доли — нет', () => {
    const p = { computed: { rows: [{ revenue: 1000, orders: 4, ad_budget: 200, avg_check: 250 }], grandTotal: { revenue: 1000, orders: 4, ad_budget: 200, roas: 5 } } }
    const s = scalePlan(p, 0.5)
    expect(s.computed.rows[0]).toMatchObject({ revenue: 500, orders: 2, ad_budget: 100, avg_check: 250 })
    expect(s.computed.grandTotal).toMatchObject({ revenue: 500, roas: 5 })
    expect(scalePlan(p, 1)).toBe(p)
  })
})
