import { describe, it, expect } from 'vitest'
import { commerceLeaves, buildTree, totals, UNALLOCATED } from './commerce'
import { spendIndex, derive, UNKNOWN } from './metrics'

const stages = { qual: 'q', held: 'h' }
const B = 'brand-nd'

const deals = [
  // Instagram: 2 quals for task A, 1 qual for task B; 1 sale each in A
  { id: 'd1', brand_id: B, client_task_id: 'A', demand_source_id: 'ig', sale_at: '2026-11-03', revenue: 900 },
  { id: 'd2', brand_id: B, client_task_id: 'A', demand_source_id: 'ig' },
  { id: 'd3', brand_id: B, client_task_id: 'B', demand_source_id: 'ig' },
  // unqualified lead, no task
  { id: 'd4', brand_id: B, client_task_id: null, demand_source_id: 'ig' },
  // lead with unknown source
  { id: 'd5', brand_id: B, client_task_id: 'A', demand_source_id: null, sale_at: '2026-11-04', revenue: 100 },
]
const events = [
  { deal_id: 'd1', stage_id: 'q' },
  { deal_id: 'd1', stage_id: 'h' },
  { deal_id: 'd2', stage_id: 'q' },
  { deal_id: 'd3', stage_id: 'q' },
  { deal_id: 'd5', stage_id: 'q' },
]
const plans = [
  {
    brand_id: B,
    computed: {
      rows: [
        { client_task_id: 'A', demand_source_id: 'ig', revenue: 2000, orders: 2, ad_budget: 200 },
        { client_task_id: 'B', demand_source_id: 'ig', revenue: 1000, orders: 1, ad_budget: 100 },
        { client_task_id: 'A', demand_source_id: '2gis', revenue: 500, orders: 1, ad_budget: 50 },
      ],
    },
  },
]

function build(spendRows, manual = []) {
  const { bySource } = spendIndex(spendRows, manual)
  return commerceLeaves({ deals, events, plans, spendBySource: bySource, spendBrands: new Set([B]), stages })
}

describe('commerceLeaves', () => {
  it('sums fact revenue/sales per brand × task × source', () => {
    const leaves = build([])
    const a = leaves.find((l) => l.task_id === 'A' && l.source_id === 'ig')
    expect(a.fact.sales).toBe(1)
    expect(a.fact.revenue).toBe(900)
    expect(a.fact.leads).toBe(2)
    expect(a.plan.revenue).toBe(2000)
  })

  it('buckets deals without a source as UNKNOWN', () => {
    const leaves = build([])
    const u = leaves.find((l) => l.source_id === UNKNOWN)
    expect(u.fact.revenue).toBe(100)
  })

  it('splits a source spend across tasks by qualified leads', () => {
    const leaves = build([{ brand_id: B, demand_source_id: 'ig', spend: 300 }])
    const a = leaves.find((l) => l.task_id === 'A' && l.source_id === 'ig')
    const b = leaves.find((l) => l.task_id === 'B' && l.source_id === 'ig')
    expect(a.fact.budget).toBe(200) // 2 of 3 quals
    expect(b.fact.budget).toBe(100)
  })

  it('falls back to planned budget shares when the source has no quals', () => {
    const leaves = build([], [{ brand_id: B, demand_source_id: '2gis', amount: 80 }])
    const a2 = leaves.find((l) => l.task_id === 'A' && l.source_id === '2gis')
    expect(a2.fact.budget).toBe(80)
  })

  it('keeps spend it cannot tie to a task as UNALLOCATED, so the brand total is exact', () => {
    const leaves = build([{ brand_id: B, demand_source_id: 'tiktok', spend: 70 }])
    const un = leaves.find((l) => l.task_id === UNALLOCATED)
    expect(un.fact.budget).toBe(70)
    expect(totals(leaves).fact.budget).toBe(70)
  })

  it('marks budget fact unknown (н/д) for brands without spend data', () => {
    const { bySource } = spendIndex([], [])
    const leaves = commerceLeaves({ deals, events, plans, spendBySource: bySource, spendBrands: new Set(), stages })
    expect(derive(totals(leaves).fact).roas).toBeNull()
  })
})

describe('buildTree', () => {
  it('tree totals equal the sum of leaves at every level', () => {
    const leaves = build([{ brand_id: B, demand_source_id: 'ig', spend: 300 }])
    const tree = buildTree(leaves, ['brand_id', 'task_id', 'source_id'])
    const t = totals(leaves)
    expect(tree[0].fact.revenue).toBe(t.fact.revenue)
    expect(tree[0].fact.budget).toBe(t.fact.budget)
    const sumTasks = tree[0].children.reduce((a, n) => a + n.fact.revenue, 0)
    expect(sumTasks).toBe(t.fact.revenue)
  })

  it('by-source view keeps unallocated spend on its source', () => {
    const leaves = build([{ brand_id: B, demand_source_id: 'tiktok', spend: 70 }])
    const tree = buildTree(leaves, ['brand_id', 'source_id'])
    const tt = tree[0].children.find((n) => n.id === 'tiktok')
    expect(tt.fact.budget).toBe(70)
  })

  it('derives ROAS and CAC from sums', () => {
    const leaves = build([{ brand_id: B, demand_source_id: 'ig', spend: 300 }])
    const ig = buildTree(leaves, ['source_id']).find((n) => n.id === 'ig')
    expect(ig.factM.roas).toBe(3) // 900 / 300
    expect(ig.factM.cac).toBe(300) // 300 / 1 sale
  })
})

import { monthPace } from './metrics'
describe('monthPace', () => {
  const now = new Date(2026, 10, 10) // 10 Nov 2026
  it('is the elapsed share of the current month', () => {
    expect(monthPace('2026-11-01', now)).toBeCloseTo(10 / 30, 5)
  })
  it('is 1 for past months and 0 for future ones', () => {
    expect(monthPace('2026-10-01', now)).toBe(1)
    expect(monthPace('2026-12-01', now)).toBe(0)
  })
})
