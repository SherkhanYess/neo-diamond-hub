import { describe, it, expect } from 'vitest'
import { funnelRows, commerceRows, plannedStageCounts, spendByDay, pulseTone } from './pulse'

const stages = [
  { id: 'a', name: 'Обращение', sort_order: 1 },
  { id: 'q', name: 'Квалификация', sort_order: 2, is_qualification: true },
  { id: 's', name: 'Продажа', sort_order: 3, is_sale: true },
  { id: 'x', name: 'Отказ', sort_order: 4 },
]
const deals = [
  { id: 1, sale_at: '2026-11-03T10:00:00', revenue: 500 },
  { id: 2, sale_at: null, revenue: 0 },
  { id: 3, sale_at: null, revenue: 0 },
  { id: 4, sale_at: null, revenue: 0 },
]
const ev = (deal_id, stage_id, d) => ({ deal_id, stage_id, entered_at: `2026-11-0${d}T09:00:00` })
const events = [ev(1, 'a', 1), ev(1, 'q', 2), ev(1, 's', 3), ev(2, 'a', 1), ev(2, 'q', 2), ev(3, 'a', 8), ev(4, 'a', 9)]
const key = (d) => `2026-11-0${d}`

describe('funnelRows', () => {
  const f = funnelRows({ deals, events, orderedStages: stages, stagePlans: { a: 8, s: 2 }, revenuePlan: 1000 })
  const row = (k) => f.rows.find((r) => r.key === k)
  it('stops at the sale stage and adds CV, overall, revenue, avg check', () => {
    expect(f.rows.map((r) => r.key)).toEqual(['a', 'repeats', 'cv:a>q', 'q', 'cv:q>s', 's', 'cv:overall', 'revenue', 'avg_check'])
  })
  it('counts fact by month and by period', () => {
    expect(row('a').fact).toBe(4)
    expect(row('a').bucket([key(1)])).toBe(2)
    expect(row('cv:a>q').fact).toBe(0.5)
    expect(row('cv:overall').plan).toBe(0.25)
    expect(row('revenue').bucket([key(3)])).toBe(500)
    expect(row('avg_check').plan).toBe(500)
  })
  it('has no budget rows', () => {
    expect(f.rows.some((r) => r.key === 'budget')).toBe(false)
  })
})

describe('funnelRows — повторные обращения', () => {
  // Сделка 5 — повторное обращение того же клиента: дошла до продажи.
  const rep = [...deals, { id: 5, is_unique: false, created_at: '2026-11-05T10:00:00', sale_at: '2026-11-06T10:00:00', revenue: 300 }]
  const repEv = [...events, ev(5, 'a', 5), ev(5, 'q', 5), ev(5, 's', 6)]
  const f = funnelRows({ deals: rep, events: repEv, orderedStages: stages })
  const row = (k) => f.rows.find((r) => r.key === k)
  it('не входит в обращения и квалификацию', () => {
    expect(row('a').fact).toBe(4)
    expect(row('q').fact).toBe(2)
  })
  it('продажа и выручка засчитываются', () => {
    expect(row('s').fact).toBe(2)
    expect(row('revenue').fact).toBe(800)
  })
  it('видна отдельной строкой по дню обращения', () => {
    expect(row('repeats').fact).toBe(1)
    expect(row('repeats').bucket([key(5)])).toBe(1)
  })
})

describe('commerceRows', () => {
  const funnel = funnelRows({ deals, events, orderedStages: stages, stagePlans: { a: 8, q: 4, s: 2 }, revenuePlan: 1000 })
  const byDay = spendByDay([{ day: '2026-11-01', spend: 100 }], [{ spent_on: '2026-11-08', amount: 300 }])
  const rows = commerceRows({ funnel, qualStageId: 'q', budget: { plan: 800, fact: 200, byDay, scale: 0.5 } })
  const row = (k) => rows.find((r) => r.key === k)
  it('runs from budget to ROAS', () => {
    expect(rows[0].key).toBe('budget')
    expect(rows[0].section).toBe('Вложения')
    expect(rows.at(-1).key).toBe('roas')
  })
  it('spreads the selected share of spend over days', () => {
    expect(row('budget').bucket([key(1)])).toBe(50)
    expect(row('budget').bucket([key(8)])).toBe(150)
    expect(row('cpl').fact).toBe(50)
    expect(row('cpq').plan).toBe(200)
    expect(row('cac').fact).toBe(200)
    expect(row('roas').fact).toBe(2.5)
    expect(row('roas').plan).toBe(1.25)
  })
  it('budget unknown → н/д, not zero', () => {
    const r = commerceRows({ funnel, qualStageId: 'q', budget: { plan: 800, fact: null, byDay: new Map() } })
    expect(r[0].fact).toBe(null)
    expect(r.find((x) => x.key === 'roas').fact).toBe(null)
  })
})

describe('plannedStageCounts', () => {
  it('rolls sales back through conversions, sums plans, explicit wins', () => {
    const conv = [
      { from_stage_id: 'a', to_stage_id: 'q', rate: 0.5 },
      { from_stage_id: 'q', to_stage_id: 's', rate: 0.25 },
    ]
    const c = plannedStageCounts([{ conversions: conv, orders: 2 }, { conversions: conv, orders: 1 }], stages, { a: 30 })
    expect(c.s).toBe(3)
    expect(c.q).toBe(12)
    expect(c.a).toBe(30)
  })
})

describe('pulseTone', () => {
  it('judges volumes by pace and costs as lower-better', () => {
    expect(pulseTone({ plan: 100, fact: 50, additive: true }, 0.5)).toBe('good')
    expect(pulseTone({ plan: 100, fact: 40, additive: true }, 0.5)).toBe('bad')
    expect(pulseTone({ plan: 100, fact: 90, lowerBetter: true }, 1)).toBe('good')
    expect(pulseTone({ plan: 100, fact: 130, lowerBetter: true }, 1)).toBe('bad')
  })
})
