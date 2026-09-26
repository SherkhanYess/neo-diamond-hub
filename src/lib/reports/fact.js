// Fact aggregation from CRM deals. Pure functions; the UI feeds already
// period/branch-filtered deals. `null` in a result means "н/д" (not applicable).

export const NA = null

// Median of numbers (days). Returns null for an empty list.
export function median(values) {
  const arr = values.filter((v) => v != null).slice().sort((a, b) => a - b)
  if (arr.length === 0) return null
  const mid = Math.floor(arr.length / 2)
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2
}

export function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO).getTime()
  const b = new Date(toISO).getTime()
  return (b - a) / (1000 * 60 * 60 * 24)
}

// Which stage ids each deal reached, from its stage events.
function reachedByDeal(deals, events) {
  const map = new Map()
  for (const d of deals) map.set(d.id, new Set())
  for (const e of events) {
    if (map.has(e.deal_id)) map.get(e.deal_id).add(e.stage_id)
  }
  return map
}

// Funnel counts per stage over the deal cohort.
// stagesOrdered: [{id, sort_order, is_qualification, is_sale}] ascending.
// opts.taskFilter / opts.sourceFilter mark whether an attribute filter is active,
// which triggers the "н/д" rule for early stages.
export function funnelCounts(deals, events, stagesOrdered, opts = {}) {
  const reached = reachedByDeal(deals, events)
  const qualOrder = stagesOrdered.find((s) => s.is_qualification)?.sort_order ?? -Infinity
  // "Встреча состоялась" is the stage right where demand source becomes known.
  const meetHeldOrder = opts.meetHeldOrder ?? Infinity

  return stagesOrdered.map((stage) => {
    if (opts.taskFilter && stage.sort_order < qualOrder) {
      return { stage_id: stage.id, count: NA }
    }
    if (opts.sourceFilter && stage.sort_order < meetHeldOrder) {
      return { stage_id: stage.id, count: NA }
    }
    let count = 0
    for (const d of deals) {
      if (reached.get(d.id)?.has(stage.id)) count++
    }
    return { stage_id: stage.id, count }
  })
}

// Conversion between consecutive stages: count_{i+1} / count_i.
// Only computed when both stages have a numeric count.
export function funnelConversions(counts) {
  const out = []
  for (let i = 0; i < counts.length - 1; i++) {
    const from = counts[i].count
    const to = counts[i + 1].count
    const rate = from == null || to == null ? NA : from > 0 ? to / from : 0
    out.push({ from_stage_id: counts[i].stage_id, to_stage_id: counts[i + 1].stage_id, rate })
  }
  return out
}

// Revenue and order (won-deal) totals for the cohort.
export function totals(deals) {
  const won = deals.filter((d) => d.sale_at)
  const revenue = won.reduce((s, d) => s + (Number(d.revenue) || 0), 0)
  const orders = won.length
  return { revenue, orders, avg_check: orders ? revenue / orders : 0 }
}

// Group won-deal revenue/orders by a key (client_task_id or demand_source_id).
export function totalsBy(deals, key) {
  const map = new Map()
  for (const d of deals) {
    if (!d.sale_at) continue
    const k = d[key]
    const cur = map.get(k) || { key: k, revenue: 0, orders: 0 }
    cur.revenue += Number(d.revenue) || 0
    cur.orders += 1
    map.set(k, cur)
  }
  return [...map.values()].map((r) => ({ ...r, avg_check: r.orders ? r.revenue / r.orders : 0 }))
}

// Deal-cycle median in days over won deals in the cohort.
export function dealCycle(deals) {
  const durations = deals
    .filter((d) => d.sale_at && d.created_at)
    .map((d) => daysBetween(d.created_at, d.sale_at))
  return { median_days: median(durations), count: durations.length }
}
