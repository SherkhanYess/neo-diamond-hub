import { funnelCounts, funnelConversions, totals, dealCycle } from './fact'
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
