// Pure planning calculations. No rounding inside — callers round for display only.

export function sourceRevenue(taskTargetRevenue, revenueSharePct) {
  return (Number(taskTargetRevenue) || 0) * ((Number(revenueSharePct) || 0) / 100)
}

export function orders(revenue, avgCheck) {
  const check = Number(avgCheck) || 0
  if (check <= 0) return 0
  return (Number(revenue) || 0) / check
}

export function taskAdBudget(taskTargetRevenue, adBudgetPct) {
  return (Number(taskTargetRevenue) || 0) * ((Number(adBudgetPct) || 0) / 100)
}

// Explicit budget wins; otherwise default = source revenue × task budget %.
export function sourceAdBudget(explicit, revenue, adBudgetPct) {
  if (explicit !== null && explicit !== undefined && explicit !== '') return Number(explicit) || 0
  return (Number(revenue) || 0) * ((Number(adBudgetPct) || 0) / 100)
}

export function cac(adBudget, ordersCount) {
  const o = Number(ordersCount) || 0
  if (o <= 0) return 0
  return (Number(adBudget) || 0) / o
}

export function roas(revenue, adBudget) {
  const b = Number(adBudget) || 0
  if (b <= 0) return 0
  return (Number(revenue) || 0) / b
}

export function sharesSum(sources) {
  return sources.reduce((s, src) => s + (Number(src.revenue_share) || 0), 0)
}

export function weightedAvgCheck(totalRevenue, totalOrders) {
  if (!totalOrders) return 0
  return totalRevenue / totalOrders
}

// One computed row per task×source.
export function computeSourceRow(task, src) {
  const revenue = sourceRevenue(task.target_revenue, src.revenue_share)
  const ord = orders(revenue, src.avg_check)
  const adBudget = sourceAdBudget(src.ad_budget, revenue, task.ad_budget_pct)
  return {
    client_task_id: task.client_task_id,
    demand_source_id: src.demand_source_id,
    owner_id: src.owner_id ?? null,
    revenue,
    orders: ord,
    avg_check: Number(src.avg_check) || 0,
    ad_budget: adBudget,
    cac: cac(adBudget, ord),
    roas: roas(revenue, adBudget),
  }
}

// Full marketing sheet: rows, per-task totals, per-source totals, grand total.
export function computeMarketing(tasks) {
  const rows = []
  const taskTotals = []
  for (const task of tasks) {
    const taskRows = (task.sources || []).map((src) => computeSourceRow(task, src))
    rows.push(...taskRows)
    const revenue = taskRows.reduce((s, r) => s + r.revenue, 0)
    const ord = taskRows.reduce((s, r) => s + r.orders, 0)
    const adBudget = taskRows.reduce((s, r) => s + r.ad_budget, 0)
    taskTotals.push({
      client_task_id: task.client_task_id,
      target_revenue: Number(task.target_revenue) || 0,
      revenue,
      orders: ord,
      ad_budget: adBudget,
      avg_check: weightedAvgCheck(revenue, ord),
      cac: cac(adBudget, ord),
      roas: roas(revenue, adBudget),
      shares_sum: sharesSum(task.sources || []),
    })
  }

  // Totals grouped by demand source across all tasks.
  const bySource = new Map()
  for (const r of rows) {
    const cur = bySource.get(r.demand_source_id) || { demand_source_id: r.demand_source_id, revenue: 0, orders: 0, ad_budget: 0 }
    cur.revenue += r.revenue
    cur.orders += r.orders
    cur.ad_budget += r.ad_budget
    bySource.set(r.demand_source_id, cur)
  }
  const sourceTotals = [...bySource.values()].map((s) => ({
    ...s,
    avg_check: weightedAvgCheck(s.revenue, s.orders),
    cac: cac(s.ad_budget, s.orders),
    roas: roas(s.revenue, s.ad_budget),
  }))

  const grand = rows.reduce(
    (acc, r) => ({ revenue: acc.revenue + r.revenue, orders: acc.orders + r.orders, ad_budget: acc.ad_budget + r.ad_budget }),
    { revenue: 0, orders: 0, ad_budget: 0 }
  )
  const grandTotal = {
    ...grand,
    avg_check: weightedAvgCheck(grand.revenue, grand.orders),
    cac: cac(grand.ad_budget, grand.orders),
    roas: roas(grand.revenue, grand.ad_budget),
  }

  return { rows, taskTotals, sourceTotals, grandTotal }
}

// Roll orders backward through conversions to get the count at each funnel stage.
// stageIds: ordered [обращение, …, продажа]. conversions: map "fromId>toId" -> rate.
// ordersAtSale is the count at the final (sale) stage.
export function stageCountsBackward(stageIds, conversions, ordersAtSale) {
  const counts = {}
  const last = stageIds[stageIds.length - 1]
  counts[last] = ordersAtSale
  for (let i = stageIds.length - 2; i >= 0; i--) {
    const from = stageIds[i]
    const to = stageIds[i + 1]
    const rate = Number(conversions[`${from}>${to}`]) || 0
    counts[from] = rate > 0 ? counts[to] / rate : 0
  }
  return counts
}

export function validateShares(tasks, tolerance = 0.01) {
  const bad = []
  for (const task of tasks) {
    // A task with no planned revenue is simply not part of this plan.
    if ((Number(task.target_revenue) || 0) <= 0) continue
    const sum = sharesSum(task.sources || [])
    if (Math.abs(sum - 100) > tolerance) bad.push({ client_task_id: task.client_task_id, sum })
  }
  return { valid: bad.length === 0, offending: bad }
}
