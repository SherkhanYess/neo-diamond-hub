// Per-day / per-week aggregation for "рука на пульсе" views.

export function dayKey(d) {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

// All days of the month with a 7-day week index (1-based).
export function monthDays(month) {
  const start = new Date(month)
  const y = start.getFullYear()
  const m = start.getMonth()
  const count = new Date(y, m + 1, 0).getDate()
  const days = []
  for (let d = 1; d <= count; d++) {
    const date = new Date(y, m, d)
    days.push({ day: d, date, key: dayKey(date), week: Math.floor((d - 1) / 7) + 1 })
  }
  return days
}

// Buckets: one per day, or one per 7-day week.
export function buckets(month, grouping) {
  const days = monthDays(month)
  if (grouping === 'week') {
    const byWeek = new Map()
    for (const d of days) {
      if (!byWeek.has(d.week)) byWeek.set(d.week, [])
      byWeek.get(d.week).push(d)
    }
    return [...byWeek.entries()].map(([week, ds]) => ({
      id: `w${week}`,
      label: `${week}-я неделя`,
      sub: `${ds[0].day}–${ds[ds.length - 1].day}`,
      keys: ds.map((d) => d.key),
    }))
  }
  return days.map((d) => ({
    id: d.key,
    label: String(d.day).padStart(2, '0'),
    sub: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.date.getDay()],
    keys: [d.key],
  }))
}

// Count stage entries per day, and sales revenue/orders per day.
export function funnelSeries(deals, events) {
  const dealById = new Map(deals.map((d) => [d.id, d]))
  const byStageDay = new Map() // stage_id -> (dayKey -> count)
  for (const e of events) {
    if (!dealById.has(e.deal_id)) continue
    if (!byStageDay.has(e.stage_id)) byStageDay.set(e.stage_id, new Map())
    const day = dayKey(e.entered_at)
    const m = byStageDay.get(e.stage_id)
    m.set(day, (m.get(day) || 0) + 1)
  }
  const salesByDay = new Map() // dayKey -> {orders, revenue}
  for (const d of deals) {
    if (!d.sale_at) continue
    const day = dayKey(d.sale_at)
    const cur = salesByDay.get(day) || { orders: 0, revenue: 0 }
    cur.orders += 1
    cur.revenue += Number(d.revenue) || 0
    salesByDay.set(day, cur)
  }
  return { byStageDay, salesByDay }
}

export function sumOverKeys(map, keys) {
  return keys.reduce((s, k) => s + (map?.get(k) || 0), 0)
}
