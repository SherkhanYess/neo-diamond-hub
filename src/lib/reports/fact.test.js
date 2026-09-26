import { describe, it, expect } from 'vitest'
import { median, funnelCounts, funnelConversions, totals, totalsBy, dealCycle } from './fact'

const stages = [
  { id: 's1', sort_order: 1, is_qualification: false, is_sale: false }, // Обращение
  { id: 's2', sort_order: 2, is_qualification: true, is_sale: false }, // Квалифицирован
  { id: 's3', sort_order: 3, is_qualification: false, is_sale: false }, // Встреча назначена
  { id: 's4', sort_order: 4, is_qualification: false, is_sale: false }, // Встреча состоялась
  { id: 's5', sort_order: 5, is_qualification: false, is_sale: true }, // Продажа
]

// 4 deals, various depths.
const deals = [
  { id: 'd1', created_at: '2026-09-01', sale_at: '2026-09-11', revenue: 1_000_000, client_task_id: 'gift', demand_source_id: 'perf' },
  { id: 'd2', created_at: '2026-09-02', sale_at: '2026-09-06', revenue: 2_000_000, client_task_id: 'gift', demand_source_id: 'content' },
  { id: 'd3', created_at: '2026-09-03', sale_at: null, revenue: null, client_task_id: 'gift', demand_source_id: null },
  { id: 'd4', created_at: '2026-09-04', sale_at: null, revenue: null, client_task_id: null, demand_source_id: null },
]
const events = [
  { deal_id: 'd1', stage_id: 's1' }, { deal_id: 'd1', stage_id: 's2' }, { deal_id: 'd1', stage_id: 's3' }, { deal_id: 'd1', stage_id: 's4' }, { deal_id: 'd1', stage_id: 's5' },
  { deal_id: 'd2', stage_id: 's1' }, { deal_id: 'd2', stage_id: 's2' }, { deal_id: 'd2', stage_id: 's3' }, { deal_id: 'd2', stage_id: 's4' }, { deal_id: 'd2', stage_id: 's5' },
  { deal_id: 'd3', stage_id: 's1' }, { deal_id: 'd3', stage_id: 's2' },
  { deal_id: 'd4', stage_id: 's1' },
]

describe('median', () => {
  it('odd length', () => expect(median([3, 1, 2])).toBe(2))
  it('even length averages middle two', () => expect(median([1, 2, 3, 4])).toBe(2.5))
  it('empty -> null', () => expect(median([])).toBeNull())
})

describe('funnelCounts', () => {
  it('counts deals reaching each stage', () => {
    const c = funnelCounts(deals, events, stages)
    expect(c.map((x) => x.count)).toEqual([4, 3, 2, 2, 2])
  })
  it('task filter marks pre-qualification stages as н/д', () => {
    const c = funnelCounts(deals, events, stages, { taskFilter: true })
    expect(c[0].count).toBeNull() // Обращение
    expect(c[1].count).toBe(3) // Квалифицирован onward numeric
  })
  it('source filter marks stages before "Встреча состоялась" as н/д', () => {
    const c = funnelCounts(deals, events, stages, { sourceFilter: true, meetHeldOrder: 4 })
    expect(c[0].count).toBeNull()
    expect(c[2].count).toBeNull() // Встреча назначена
    expect(c[3].count).toBe(2) // Встреча состоялась numeric
  })
})

describe('funnelConversions', () => {
  it('divides consecutive counts', () => {
    const c = funnelCounts(deals, events, stages)
    const conv = funnelConversions(c)
    expect(conv[0].rate).toBe(0.75) // 3/4
    expect(conv[1].rate).toBeCloseTo(0.6667, 3) // 2/3
  })
  it('н/д when a neighbour is н/д', () => {
    const c = funnelCounts(deals, events, stages, { taskFilter: true })
    const conv = funnelConversions(c)
    expect(conv[0].rate).toBeNull()
  })
})

describe('totals and grouping', () => {
  it('sums won-deal revenue and orders', () => {
    expect(totals(deals)).toEqual({ revenue: 3_000_000, orders: 2, avg_check: 1_500_000 })
  })
  it('groups by demand source (first touch)', () => {
    const byS = totalsBy(deals, 'demand_source_id')
    expect(byS.find((r) => r.key === 'perf').revenue).toBe(1_000_000)
    expect(byS.find((r) => r.key === 'content').orders).toBe(1)
  })
})

describe('dealCycle', () => {
  it('median days over won deals', () => {
    // d1: 10 days, d2: 4 days -> median 7
    expect(dealCycle(deals)).toEqual({ median_days: 7, count: 2 })
  })
})
