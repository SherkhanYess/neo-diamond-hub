import { describe, it, expect } from 'vitest'
import { qualifiedDealIds, adMetrics, withoutAd, rollUp } from './performance'

const events = [
  { deal_id: 'd1', stage_id: 'qual' },
  { deal_id: 'd2', stage_id: 'qual' },
  { deal_id: 'd3', stage_id: 'obr' },
]
const qualifiedIds = qualifiedDealIds(events, 'qual')

const ads = [{ id: 'a1', external_id: 'ext-1', name: 'UGC 1', spend: 300_000, impressions: 10000, clicks: 200 }]
const deals = [
  { id: 'd1', ad_id: 'ext-1', is_ignored: false, client_task_id: 'gift', demand_source_id: 'perf' },
  { id: 'd2', ad_id: 'ext-1', is_ignored: false, client_task_id: 'engage', demand_source_id: 'perf' },
  { id: 'd3', ad_id: 'ext-1', is_ignored: true, client_task_id: null, demand_source_id: 'perf' },
  { id: 'd4', ad_id: null, is_ignored: false, client_task_id: null, demand_source_id: 'perf' },
]

describe('qualifiedDealIds', () => {
  it('collects deals that hit the qualification stage', () => {
    expect(qualifiedIds.has('d1')).toBe(true)
    expect(qualifiedIds.has('d3')).toBe(false)
  })
})

describe('adMetrics', () => {
  const [m] = adMetrics(ads, deals, qualifiedIds, 10)
  it('counts leads and quals', () => {
    expect(m.leads).toBe(3)
    expect(m.quals).toBe(2)
  })
  it('cost per qual = spend / quals', () => {
    expect(m.cost_per_qual).toBe(150_000)
  })
  it('ignore rate = ignored / leads', () => {
    expect(m.ignore_rate).toBeCloseTo(1 / 3, 4)
  })
  it('breaks quals down by client task', () => {
    expect(m.task_breakdown).toEqual({ gift: 1, engage: 1 })
  })
  it('flags low data below threshold', () => {
    expect(m.low_data).toBe(true) // 2 < 10
  })
})

describe('withoutAd', () => {
  it('counts Performance deals with no ad id', () => {
    const w = withoutAd(deals, 'perf', qualifiedIds)
    expect(w.leads).toBe(1) // d4
    expect(w.quals).toBe(0)
  })
})

describe('rollUp', () => {
  it('sums children and recomputes cost per qual', () => {
    const r = rollUp([
      { spend: 300_000, leads: 3, quals: 2, ignore_rate: 1 / 3 },
      { spend: 100_000, leads: 2, quals: 2, ignore_rate: 0 },
    ])
    expect(r.spend).toBe(400_000)
    expect(r.quals).toBe(4)
    expect(r.cost_per_qual).toBe(100_000)
  })
})
