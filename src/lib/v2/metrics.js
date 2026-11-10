// Shared metric math for v2 (Коммерция, Маркетинг, Отдел продаж).
// Every section derives ratios from the same sums, so their totals agree.

export const UNKNOWN = '__unknown__'

export function emptySums() {
  return { budget: 0, revenue: 0, sales: 0, leads: 0, quals: 0, meetings: 0, budgetKnown: false }
}

export function addSums(a, b) {
  return {
    budget: a.budget + b.budget,
    revenue: a.revenue + b.revenue,
    sales: a.sales + b.sales,
    leads: a.leads + b.leads,
    quals: a.quals + b.quals,
    meetings: a.meetings + b.meetings,
    budgetKnown: a.budgetKnown || b.budgetKnown,
  }
}

const div = (a, b) => (b ? a / b : null)

// Ratios from sums. null = not computable (н/д).
export function derive(s) {
  return {
    budget: s.budgetKnown ? s.budget : null,
    revenue: s.revenue,
    sales: s.sales,
    leads: s.leads,
    quals: s.quals,
    meetings: s.meetings,
    avg_check: div(s.revenue, s.sales),
    roas: s.budgetKnown ? div(s.revenue, s.budget) : null,
    cac: s.budgetKnown ? div(s.budget, s.sales) : null,
    cpl: s.budgetKnown ? div(s.budget, s.leads) : null,
    cpq: s.budgetKnown ? div(s.budget, s.quals) : null,
  }
}

// A plan line (from the approved snapshot) as sums.
export function planSums({ revenue = 0, orders = 0, ad_budget = 0 } = {}) {
  return { ...emptySums(), revenue, sales: orders, budget: ad_budget, budgetKnown: true }
}

export function isWon(deal) {
  return !!deal.sale_at
}

// Which stages each deal reached (from stage events).
export function reachedStages(events) {
  const m = new Map()
  for (const e of events) {
    if (!m.has(e.deal_id)) m.set(e.deal_id, new Set())
    m.get(e.deal_id).add(e.stage_id)
  }
  return m
}

// Fact sums of one deal. `stages` = { qual, held } stage ids.
export function dealSums(deal, reached, stages) {
  const r = reached.get(deal.id) || new Set()
  const won = isWon(deal)
  return {
    ...emptySums(),
    leads: 1,
    quals: r.has(stages.qual) || deal.client_task_id ? 1 : 0,
    meetings: r.has(stages.held) ? 1 : 0,
    sales: won ? 1 : 0,
    revenue: won ? Number(deal.revenue) || 0 : 0,
  }
}

export function stageIds(orderedStages) {
  const qual = orderedStages.find((s) => s.is_qualification)?.id
  const sale = orderedStages.find((s) => s.is_sale)?.id
  const held = orderedStages.find((s) => /состоял/i.test(s.name))?.id
  const set = orderedStages.find((s) => /назнач/i.test(s.name))?.id
  return { qual, held, sale, set, first: orderedStages[0]?.id }
}

// Spend per (brand, source) and (brand, converter) from cabinet stats + manual entries.
export function spendIndex(adRows, manual) {
  const bySource = new Map()
  const byConverter = new Map()
  const add = (map, key, v) => map.set(key, (map.get(key) || 0) + v)
  for (const r of adRows) {
    const s = Number(r.spend) || 0
    add(bySource, `${r.brand_id}:${r.demand_source_id ?? UNKNOWN}`, s)
    if (r.converter_id) add(byConverter, `${r.brand_id}:${r.converter_id}`, s)
  }
  for (const m of manual) {
    const v = Number(m.amount) || 0
    add(bySource, `${m.brand_id}:${m.demand_source_id ?? UNKNOWN}`, v)
    if (m.converter_id) add(byConverter, `${m.brand_id}:${m.converter_id}`, v)
  }
  return { bySource, byConverter }
}

// Share of the month already elapsed (1 for past months, 0 for future ones).
export function monthPace(month, now = new Date()) {
  const d = new Date(month)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  if (now.getFullYear() > y || (now.getFullYear() === y && now.getMonth() > m)) return 1
  if (now.getFullYear() < y || (now.getFullYear() === y && now.getMonth() < m)) return 0
  return Math.min(1, now.getDate() / days)
}
