import { describe, it, expect } from 'vitest'
import {
  sourceRevenue,
  orders,
  sourceAdBudget,
  cac,
  roas,
  weightedAvgCheck,
  computeMarketing,
  stageCountsBackward,
  validateShares,
} from './calc'

describe('basic formulas', () => {
  it('source revenue = target × share%', () => {
    expect(sourceRevenue(10_000_000, 40)).toBe(4_000_000)
  })
  it('orders = revenue ÷ avg check, no rounding', () => {
    expect(orders(4_000_000, 700_000)).toBeCloseTo(5.714285, 5)
  })
  it('orders is 0 when avg check is 0', () => {
    expect(orders(1000, 0)).toBe(0)
  })
  it('source ad budget defaults to revenue × task budget %', () => {
    expect(sourceAdBudget(null, 4_000_000, 10)).toBe(400_000)
  })
  it('explicit ad budget overrides default', () => {
    expect(sourceAdBudget(500_000, 4_000_000, 10)).toBe(500_000)
  })
  it('CAC = budget ÷ orders', () => {
    expect(cac(400_000, 5)).toBe(80_000)
  })
  it('ROAS = revenue ÷ budget', () => {
    expect(roas(4_000_000, 400_000)).toBe(10)
  })
  it('weighted avg check = total revenue ÷ total orders', () => {
    expect(weightedAvgCheck(6_000_000, 10)).toBe(600_000)
  })
})

describe('computeMarketing — reference example', () => {
  // One task, two sources. 10M target, 10% budget.
  const tasks = [
    {
      client_task_id: 'gift',
      target_revenue: 10_000_000,
      ad_budget_pct: 10,
      sources: [
        { demand_source_id: 'perf', revenue_share: 60, avg_check: 600_000, ad_budget: null },
        { demand_source_id: 'content', revenue_share: 40, avg_check: 800_000, ad_budget: null },
      ],
    },
  ]
  const { rows, taskTotals, sourceTotals, grandTotal } = computeMarketing(tasks)

  it('splits revenue by share', () => {
    expect(rows[0].revenue).toBe(6_000_000)
    expect(rows[1].revenue).toBe(4_000_000)
  })
  it('computes orders per source without rounding', () => {
    expect(rows[0].orders).toBe(10) // 6M / 600k
    expect(rows[1].orders).toBe(5) // 4M / 800k
  })
  it('defaults ad budget to revenue × 10%', () => {
    expect(rows[0].ad_budget).toBe(600_000)
    expect(rows[1].ad_budget).toBe(400_000)
  })
  it('CAC and ROAS per source', () => {
    expect(rows[0].cac).toBe(60_000) // 600k / 10
    expect(rows[0].roas).toBe(10) // 6M / 600k
    expect(rows[1].cac).toBe(80_000) // 400k / 5
    expect(rows[1].roas).toBe(10)
  })
  it('task total aggregates', () => {
    const t = taskTotals[0]
    expect(t.revenue).toBe(10_000_000)
    expect(t.orders).toBe(15)
    expect(t.ad_budget).toBe(1_000_000)
    expect(t.shares_sum).toBe(100)
    expect(t.roas).toBe(10)
  })
  it('source totals grouped', () => {
    expect(sourceTotals.find((s) => s.demand_source_id === 'perf').orders).toBe(10)
  })
  it('grand total', () => {
    expect(grandTotal.revenue).toBe(10_000_000)
    expect(grandTotal.orders).toBe(15)
    expect(grandTotal.cac).toBeCloseTo(66_666.67, 1) // 1M / 15
  })
})

describe('stageCountsBackward', () => {
  it('rolls orders backward through conversions', () => {
    const stages = ['s1', 's2', 's3'] // обращение, квал, продажа
    const conv = { 's1>s2': 0.5, 's2>s3': 0.5 }
    const counts = stageCountsBackward(stages, conv, 10)
    expect(counts.s3).toBe(10)
    expect(counts.s2).toBe(20) // 10 / 0.5
    expect(counts.s1).toBe(40) // 20 / 0.5
  })
  it('zero rate gives zero upstream', () => {
    const counts = stageCountsBackward(['a', 'b'], { 'a>b': 0 }, 10)
    expect(counts.a).toBe(0)
  })
})

describe('validateShares', () => {
  it('passes when shares sum to 100', () => {
    const tasks = [{ client_task_id: 't', sources: [{ revenue_share: 60 }, { revenue_share: 40 }] }]
    expect(validateShares(tasks).valid).toBe(true)
  })
  it('fails when a planned task shares do not sum to 100', () => {
    const tasks = [{ client_task_id: 't', target_revenue: 1000, sources: [{ revenue_share: 60 }, { revenue_share: 30 }] }]
    const res = validateShares(tasks)
    expect(res.valid).toBe(false)
    expect(res.offending[0].sum).toBe(90)
  })
  it('ignores unplanned tasks (zero target revenue)', () => {
    const tasks = [{ client_task_id: 't', target_revenue: 0, sources: [{ revenue_share: 0 }] }]
    expect(validateShares(tasks).valid).toBe(true)
  })
})
