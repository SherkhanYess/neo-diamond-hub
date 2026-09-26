import { funnelCounts, funnelConversions, totals, totalsBy, dealCycle } from './fact'
import { stageCountsBackward } from '../planning/calc'

// A filter value may be a scalar, an array (multi-select), or null/empty.
export function filterActive(v) {
  return Array.isArray(v) ? v.length > 0 : v != null && v !== ''
}
function matches(value, filterVal) {
  if (!filterActive(filterVal)) return true
  return Array.isArray(filterVal) ? filterVal.includes(value) : value === filterVal
}

// Apply active attribute filters to the cohort.
export function applyFilters(deals, filters) {
  return deals.filter(
    (d) =>
      matches(d.client_task_id, filters.client_task_id) &&
      matches(d.demand_source_id, filters.demand_source_id) &&
      matches(d.lead_source_id, filters.lead_source_id) &&
      matches(d.manager_id, filters.manager_id)
  )
}

// Planned funnel counts from the approved plan: orders rolled backward through
// the plan's sales conversions.
export function plannedFunnel(plan, orderedStages) {
  if (!plan?.computed?.grandTotal) return {}
  const orders = plan.computed.grandTotal.orders
  const saleStage = orderedStages.find((s) => s.is_sale)
  const stageIds = orderedStages.filter((s) => s.sort_order <= (saleStage?.sort_order ?? Infinity)).map((s) => s.id)
  const conv = {}
  for (const c of plan.conversions || []) conv[`${c.from_stage_id}>${c.to_stage_id}`] = c.rate
  return stageCountsBackward(stageIds, conv, orders)
}

export function buildFunnel({ deals, events, plan, orderedStages, filters, meetHeldOrder }) {
  const filtered = applyFilters(deals, filters)
  const taskFilter = filterActive(filters.client_task_id)
  const sourceFilter = filterActive(filters.demand_source_id)
  const fact = funnelCounts(filtered, events, orderedStages, { taskFilter, sourceFilter, meetHeldOrder })
  const factConv = funnelConversions(fact)
  const planCounts = plannedFunnel(plan, orderedStages)

  const rows = orderedStages.map((stage, i) => {
    const factCount = fact[i]?.count ?? null
    const planCount = planCounts[stage.id] ?? null
    return {
      stage_id: stage.id,
      name: stage.name,
      plan: planCount,
      fact: factCount,
      done_pct: planCount ? (factCount != null ? (factCount / planCount) * 100 : null) : null,
      fact_conv: factConv[i]?.rate ?? null,
    }
  })

  return {
    rows,
    totals: totals(filtered),
    dealCycle: dealCycle(filtered),
    planTotals: plan?.computed?.grandTotal || null,
  }
}

// Matrix rows: task × source, plan (from snapshot) vs fact (won deals).
export function buildMatrix({ deals, plan, filters }) {
  const filtered = applyFilters(deals, filters)
  const factByTaskSource = new Map()
  for (const d of filtered) {
    if (!d.sale_at) continue
    const key = `${d.client_task_id}:${d.demand_source_id}`
    const cur = factByTaskSource.get(key) || { revenue: 0, orders: 0 }
    cur.revenue += Number(d.revenue) || 0
    cur.orders += 1
    factByTaskSource.set(key, cur)
  }
  const planRows = plan?.computed?.rows || []
  const rows = planRows.map((pr) => {
    const f = factByTaskSource.get(`${pr.client_task_id}:${pr.demand_source_id}`) || { revenue: 0, orders: 0 }
    return {
      client_task_id: pr.client_task_id,
      demand_source_id: pr.demand_source_id,
      plan_revenue: pr.revenue,
      fact_revenue: f.revenue,
      plan_orders: pr.orders,
      fact_orders: f.orders,
      plan_budget: pr.ad_budget,
      fact_budget: null, // requires ad-spend attribution (Performance phase)
      plan_avg_check: pr.avg_check,
      fact_avg_check: f.orders ? f.revenue / f.orders : 0,
      plan_cac: pr.cac,
      fact_cac: null,
      plan_roas: pr.roas,
      fact_roas: null,
    }
  })
  return { rows, factBy: (k) => factByTaskSource.get(k) }
}

// Metric column definitions for the matrix (order matters).
export const MATRIX_METRICS = [
  { key: 'revenue', label: 'Выручка', fmt: 'money' },
  { key: 'budget', label: 'Бюджет', fmt: 'money' },
  { key: 'orders', label: 'Заказы', fmt: 'num1' },
  { key: 'avg_check', label: 'Средний чек', fmt: 'money' },
  { key: 'cac', label: 'CAC', fmt: 'money' },
  { key: 'roas', label: 'ROAS', fmt: 'ratio1' },
]

// Aggregate a set of matrix rows into one combined metric bundle.
export function aggregateRows(rows) {
  const sum = (get) => rows.reduce((s, r) => s + (Number(get(r)) || 0), 0)
  const plan_revenue = sum((r) => r.plan_revenue)
  const fact_revenue = sum((r) => r.fact_revenue)
  const plan_orders = sum((r) => r.plan_orders)
  const fact_orders = sum((r) => r.fact_orders)
  const plan_budget = sum((r) => r.plan_budget)
  const hasFactBudget = rows.some((r) => r.fact_budget != null)
  const fact_budget = hasFactBudget ? sum((r) => r.fact_budget) : null
  return {
    revenue: { plan: plan_revenue, fact: fact_revenue },
    budget: { plan: plan_budget, fact: fact_budget },
    orders: { plan: plan_orders, fact: fact_orders },
    avg_check: {
      plan: plan_orders ? plan_revenue / plan_orders : 0,
      fact: fact_orders ? fact_revenue / fact_orders : 0,
    },
    cac: {
      plan: plan_orders ? plan_budget / plan_orders : 0,
      fact: fact_budget != null && fact_orders ? fact_budget / fact_orders : null,
    },
    roas: {
      plan: plan_budget ? plan_revenue / plan_budget : 0,
      fact: fact_budget ? fact_revenue / fact_budget : null,
    },
  }
}

// Group matrix rows for a view mode:
//  'nested' -> tasks with their source children
//  'task'   -> one aggregated row per task
//  'source' -> one aggregated row per source (summed across tasks)
export function groupMatrix(rows, mode) {
  if (mode === 'source') {
    const bySource = new Map()
    for (const r of rows) {
      if (!bySource.has(r.demand_source_id)) bySource.set(r.demand_source_id, [])
      bySource.get(r.demand_source_id).push(r)
    }
    return [...bySource.entries()].map(([id, rs]) => ({
      id,
      kind: 'source',
      demand_source_id: id,
      metrics: aggregateRows(rs),
    }))
  }
  // task-based (nested or task)
  const byTask = new Map()
  for (const r of rows) {
    if (!byTask.has(r.client_task_id)) byTask.set(r.client_task_id, [])
    byTask.get(r.client_task_id).push(r)
  }
  return [...byTask.entries()].map(([id, rs]) => ({
    id,
    kind: 'task',
    client_task_id: id,
    metrics: aggregateRows(rs),
    children:
      mode === 'nested'
        ? rs.map((r) => ({
            id: `${id}:${r.demand_source_id}`,
            kind: 'source-child',
            client_task_id: id,
            demand_source_id: r.demand_source_id,
            metrics: aggregateRows([r]),
          }))
        : null,
  }))
}

export function factTotalsBySource(deals, filters) {
  return totalsBy(applyFilters(deals, filters), 'demand_source_id')
}
