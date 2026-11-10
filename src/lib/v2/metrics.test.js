import { describe, it, expect } from 'vitest'
import { dealSums, emptySums, addSums, derive } from './metrics'
import { funnelOf } from './marketing'

const stages = { qual: 'q', held: 'h', set: 's' }
const reached = new Map([
  [1, new Set(['q', 'h'])],
  [2, new Set(['q', 'h'])],
])
const uniqueDeal = { id: 1, sale_at: '2026-11-03', revenue: 500 }
const repeatDeal = { id: 2, is_unique: false, sale_at: '2026-11-04', revenue: 300 }

describe('уникальный лид', () => {
  it('первое обращение — лид со всей воронкой', () => {
    expect(dealSums(uniqueDeal, reached, stages)).toMatchObject({ leads: 1, quals: 1, meetings: 1, repeats: 0, sales: 1, revenue: 500 })
  })
  it('повторное — не лид, но продажа и выручка остаются', () => {
    expect(dealSums(repeatDeal, reached, stages)).toMatchObject({ leads: 0, quals: 0, meetings: 0, repeats: 1, sales: 1, revenue: 300 })
  })
  it('суммы и CPL считаются от уникальных', () => {
    const s = [uniqueDeal, repeatDeal].map((d) => dealSums(d, reached, stages)).reduce(addSums, emptySums())
    const m = derive({ ...s, budget: 1000, budgetKnown: true })
    expect(m).toMatchObject({ leads: 1, repeats: 1, sales: 2, revenue: 800, cpl: 1000 })
  })
  it('funnelOf — то же правило', () => {
    expect(funnelOf([uniqueDeal, repeatDeal], reached, stages)).toMatchObject({ leads: 1, quals: 1, held: 1, repeats: 1, sales: 2, revenue: 800 })
  })
})
