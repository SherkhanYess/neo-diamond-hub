import { describe, it, expect } from 'vitest'
import { marketingGaps, salesGaps, commerceTotalsOf } from './reconcile'

const sources = [
  { id: 'ig', name: 'Instagram' },
  { id: 'tt', name: 'TikTok' },
]
const converters = [
  { id: 'p', demand_source_id: 'ig' },
  { id: 'a', demand_source_id: 'ig' },
  { id: 'live', demand_source_id: 'tt' },
]
const commercePlans = [
  { computed: { rows: [{ demand_source_id: 'ig', ad_budget: 1000, revenue: 9000, orders: 9 }, { demand_source_id: 'tt', ad_budget: 400, revenue: 1000, orders: 1 }], grandTotal: { orders: 10, revenue: 10000 } } },
  { computed: { rows: [{ demand_source_id: 'ig', ad_budget: 500, revenue: 3000, orders: 3 }], grandTotal: { orders: 3, revenue: 3000 } } },
]

describe('marketingGaps', () => {
  it('passes when converter budgets add up to the source budget across branches', () => {
    const lines = [
      { converter_id: 'p', budget: 0 },
      { converter_id: 'a', budget: 1500 },
      { converter_id: 'live', budget: 400 },
    ]
    expect(marketingGaps({ commercePlans, lines, converters, sources })).toEqual([])
  })
  it('reports a source whose converters plan less than the commerce budget', () => {
    const lines = [{ converter_id: 'a', budget: 1500 }, { converter_id: 'live', budget: 300 }]
    const g = marketingGaps({ commercePlans, lines, converters, sources })
    expect(g).toHaveLength(1)
    expect(g[0].label).toBe('TikTok')
    expect(g[0].diff).toBe(-100)
  })
})

describe('salesGaps', () => {
  const units = [
    { id: 'L', kind: 'lead_center', name: 'Лид-центр' },
    { id: 'C', kind: 'consultations', name: 'Консультации' },
    { id: 'R', kind: 'account', name: 'Аккаунт' },
  ]
  const base = [
    { unit_id: null, profile_id: null, metric: 'sales', value: 13 },
    { unit_id: null, profile_id: null, metric: 'revenue', value: 13000 },
    { unit_id: 'C', profile_id: 'd', metric: 'sales', value: 6 },
    { unit_id: 'C', profile_id: 'y', metric: 'sales', value: 5 },
    { unit_id: 'C', profile_id: 'd', metric: 'revenue', value: 7000 },
    { unit_id: 'C', profile_id: 'y', metric: 'revenue', value: 4000 },
    { unit_id: 'R', profile_id: 'd', metric: 'repeat_sales', value: 2 },
    { unit_id: 'R', profile_id: 'd', metric: 'repeat_revenue', value: 2000 },
  ]
  const totals = commerceTotalsOf(commercePlans)

  it('is clean when people → units → department → commerce all agree', () => {
    expect(salesGaps({ targets: base, units, commerceTotals: totals })).toEqual([])
  })

  it('flags personal targets that do not add up to the unit', () => {
    const t = [...base, { unit_id: 'C', profile_id: null, metric: 'sales', value: 12 }]
    const g = salesGaps({ targets: t, units, commerceTotals: totals })
    expect(g.some((x) => x.level === 'unit' && x.top === 12 && x.bottom === 11)).toBe(true)
  })

  it('flags a department sales goal that differs from Коммерция', () => {
    const t = base.map((x) => (x.metric === 'sales' && !x.unit_id ? { ...x, value: 20 } : x))
    const g = salesGaps({ targets: t, units, commerceTotals: totals })
    expect(g.find((x) => x.level === 'commerce' && x.label.includes('продажи')).diff).toBe(7)
  })

  it('ignores sub-half-sale rounding of fractional planned orders', () => {
    const fractional = { orders: 12.6, revenue: 13000 }
    expect(salesGaps({ targets: base, units, commerceTotals: fractional })).toEqual([])
  })
})
