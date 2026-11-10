// Per-day / per-week aggregation for "рука на пульсе" views.
import { periodDays } from '../v2/period'

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

// Buckets: one per day, or one per 7-day week. `range` is a month
// ('YYYY-MM-01') or a period { from, to } — days of the period.
export function buckets(range, grouping) {
  const days =
    typeof range === 'string'
      ? monthDays(range)
      : periodDays(range).map((d) => ({ day: d.day, date: d.date, key: d.key, week: d.week }))
  const multiMonth = days.length && days[0].date.getMonth() !== days[days.length - 1].date.getMonth()
  const fmt = (d) => (multiMonth ? `${d.day}.${String(d.date.getMonth() + 1).padStart(2, '0')}` : String(d.day))
  if (grouping === 'week') {
    const byWeek = new Map()
    for (const d of days) {
      if (!byWeek.has(d.week)) byWeek.set(d.week, [])
      byWeek.get(d.week).push(d)
    }
    return [...byWeek.entries()].map(([week, ds]) => ({
      id: `w${week}`,
      label: `${week}-я неделя`,
      sub: ds.length > 1 ? `${fmt(ds[0])}–${fmt(ds[ds.length - 1])}` : fmt(ds[0]),
      keys: ds.map((d) => d.key),
    }))
  }
  return days.map((d) => ({
    id: d.key,
    label: multiMonth ? fmt(d) : String(d.day).padStart(2, '0'),
    sub: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.date.getDay()],
    keys: [d.key],
  }))
}

// Count stage entries per day, and sales revenue/orders per day.
// saleStageId: a repeat inquiry (deal.is_unique === false) counts only at the
// sale stage — it is not a lead, but its sale is real.
// basis: 'stage' — a stage counts on the day it was reached (работа ОП за день);
//        'lead'  — on the day the lead came in (качество трафика этого дня;
//                  прошлые дни дорастают, пока ОП дорабатывает лиды).
export function funnelSeries(deals, events, { saleStageId = null, basis = 'stage' } = {}) {
  const dealById = new Map(deals.map((d) => [d.id, d]))
  const byStageDay = new Map() // stage_id -> (dayKey -> count)
  const repeatsByDay = new Map() // dayKey -> repeat inquiries created that day
  for (const d of deals) {
    if (d.is_unique !== false || !d.created_at) continue
    const day = dayKey(d.created_at)
    repeatsByDay.set(day, (repeatsByDay.get(day) || 0) + 1)
  }
  for (const e of events) {
    const deal = dealById.get(e.deal_id)
    if (!deal) continue
    if (deal.is_unique === false && e.stage_id !== saleStageId) continue
    if (!byStageDay.has(e.stage_id)) byStageDay.set(e.stage_id, new Map())
    const day = dayKey(basis === 'lead' && deal.created_at ? deal.created_at : e.entered_at)
    const m = byStageDay.get(e.stage_id)
    m.set(day, (m.get(day) || 0) + 1)
  }
  const salesByDay = new Map() // dayKey -> {orders, revenue}
  for (const d of deals) {
    if (!d.sale_at) continue
    const day = dayKey(basis === 'lead' && d.created_at ? d.created_at : d.sale_at)
    const cur = salesByDay.get(day) || { orders: 0, revenue: 0 }
    cur.orders += 1
    cur.revenue += Number(d.revenue) || 0
    salesByDay.set(day, cur)
  }
  return { byStageDay, salesByDay, repeatsByDay }
}

export function sumOverKeys(map, keys) {
  return keys.reduce((s, k) => s + (map?.get(k) || 0), 0)
}
