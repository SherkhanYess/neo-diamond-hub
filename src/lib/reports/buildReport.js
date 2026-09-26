import { funnelCounts, funnelConversions, totals, totalsBy, dealCycle } from './fact'
import { stageCountsBackward } from '../planning/calc'

// Apply active attribute filters to the cohort.
export function applyFilters(deals, filters) {
  return deals.filter((d) => {
    if (filters.client_task_id && d.client_task_id !== filters.client_task_id) return false
    if (filters.demand_source_id && d.demand_source_id !== filters.demand_source_id) return false
    if (filters.lead_source_id && d.lead_source_id !== filters.lead_source_id) return false
    if (filters.manager_id && d.manager_id !== filters.manager_id) return false
    return true
  })
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
  const taskFilter = !!filters.client_task_id
  const sourceFilter = !!filters.demand_source_id
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
      plan_avg_check: pr.avg_check,
      fact_avg_check: f.orders ? f.revenue / f.orders : 0,
      // CAC/ROAS fact require ad spend (later phase) -> н/д
      plan_cac: pr.cac,
      fact_cac: null,
      plan_roas: pr.roas,
      fact_roas: null,
    }
  })
  return { rows, factBy: (k) => factByTaskSource.get(k) }
}

export function factTotalsBySource(deals, filters) {
  return totalsBy(applyFilters(deals, filters), 'demand_source_id')
}
