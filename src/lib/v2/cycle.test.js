import { describe, it, expect } from 'vitest'
import { cycleDays, cycleStats, cycleBy } from './cycle'
import { UNKNOWN } from './metrics'

const deal = (created, sold, extra = {}) => ({ created_at: `2026-11-${created}T10:00:00+05:00`, sale_at: sold ? `2026-11-${sold}T10:00:00+05:00` : null, ...extra })

describe('цикл сделки', () => {
  it('дни от обращения до продажи', () => {
    expect(cycleDays(deal('01', '04'))).toBe(3)
    expect(cycleDays(deal('01', null))).toBeNull()
  })
  it('среднее и медиана', () => {
    const s = cycleStats([deal('01', '02'), deal('01', '03'), deal('01', '05'), deal('01', '30')])
    expect(s.n).toBe(4)
    expect(s.avg).toBeCloseTo((1 + 2 + 4 + 29) / 4)
    expect(s.median).toBe(3)
    expect(cycleStats([])).toEqual({ n: 0, avg: null, median: null })
  })
  it('по группам, без группы — «не определено»', () => {
    const g = cycleBy([deal('01', '02', { t: 'a' }), deal('01', '05', { t: 'a' }), deal('01', '03', { t: null })], (d) => d.t)
    expect(g).toEqual([
      { key: 'a', n: 2, avg: 2.5, median: 2.5 },
      { key: UNKNOWN, n: 1, avg: 2, median: 2 },
    ])
  })
})
