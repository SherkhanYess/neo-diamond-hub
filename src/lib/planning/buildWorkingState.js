// Build the editable "tasks" array (task × sources matrix) from reference data
// and the loaded plan bundle. Missing input lines default to 0.

export function buildTasks(clientTasks, demandSources, bundle) {
  const taskLineById = new Map((bundle?.taskLines || []).map((l) => [l.client_task_id, l]))
  const sourceLineByKey = new Map(
    (bundle?.sourceLines || []).map((l) => [`${l.client_task_id}:${l.demand_source_id}`, l])
  )

  return clientTasks.map((task) => {
    const tl = taskLineById.get(task.id)
    return {
      client_task_id: task.id,
      name: task.name,
      target_revenue: tl?.target_revenue ?? 0,
      ad_budget_pct: tl?.ad_budget_pct ?? 0,
      sources: demandSources.map((src) => {
        const sl = sourceLineByKey.get(`${task.id}:${src.id}`)
        return {
          demand_source_id: src.id,
          name: src.name,
          revenue_share: sl?.revenue_share ?? 0,
          avg_check: sl?.avg_check ?? 0,
          ad_budget: sl?.ad_budget ?? null,
          owner_id: sl?.owner_id ?? null,
        }
      }),
    }
  })
}

// Ordered conversion pairs between consecutive funnel stages.
export function buildConversionPairs(stages, bundle) {
  const ordered = [...stages].sort((a, b) => a.sort_order - b.sort_order)
  const rateByKey = new Map(
    (bundle?.conversions || []).map((c) => [`${c.from_stage_id}>${c.to_stage_id}`, c.rate])
  )
  const pairs = []
  for (let i = 0; i < ordered.length - 1; i++) {
    const from = ordered[i]
    const to = ordered[i + 1]
    pairs.push({
      from_stage_id: from.id,
      to_stage_id: to.id,
      from_name: from.name,
      to_name: to.name,
      rate: rateByKey.get(`${from.id}>${to.id}`) ?? 0,
    })
  }
  return { ordered, pairs }
}
