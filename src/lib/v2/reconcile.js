// Top-down plan reconciliation: wherever lower plans must add up to a higher
// goal, report the gap instead of letting it vanish. Pure functions.

const TOL = { count: 0.5, money: 1 }

function gap(label, top, bottom, kind = 'count', level = '') {
  if (top == null || bottom == null) return null
  const diff = bottom - top
  return Math.abs(diff) > TOL[kind] ? { label, top, bottom, diff, kind, level } : null
}

// Commerce plan rows of a brand summed per source (all branches).
export function commerceBySource(commercePlans) {
  const m = new Map()
  for (const p of commercePlans) {
    for (const r of p.computed?.rows || []) {
      const cur = m.get(r.demand_source_id) || { budget: 0, revenue: 0, orders: 0 }
      cur.budget += Number(r.ad_budget) || 0
      cur.revenue += Number(r.revenue) || 0
      cur.orders += Number(r.orders) || 0
      m.set(r.demand_source_id, cur)
    }
  }
  return m
}

// Маркетинг ↔ Коммерция: converter budgets of a source vs its commerce budget.
export function marketingGaps({ commercePlans, lines, converters, sources }) {
  const top = commerceBySource(commercePlans)
  const out = []
  for (const s of sources) {
    const convIds = new Set(converters.filter((c) => c.demand_source_id === s.id).map((c) => c.id))
    const mine = lines.filter((l) => convIds.has(l.converter_id))
    const t = top.get(s.id)
    if (!t && !mine.length) continue
    const bottom = mine.reduce((a, l) => a + (Number(l.budget) || 0), 0)
    const g = gap(convIds.size ? s.name : `${s.name} — нет конвертеров`, t?.budget ?? 0, bottom, 'money', 'marketing')
    if (g) out.push({ ...g, source_id: s.id, noConverters: convIds.size === 0 })
  }
  return out
}

const sumWhere = (targets, pred) => {
  const list = targets.filter(pred)
  return list.length ? list.reduce((a, t) => a + Number(t.value), 0) : null
}
const MONEY = new Set(['revenue', 'repeat_revenue'])

// Отдел продаж: personal ↔ unit ↔ department ↔ Коммерция.
export function salesGaps({ targets, units, commerceTotals }) {
  const out = []
  const dept = (metric) => sumWhere(targets, (t) => !t.unit_id && !t.profile_id && t.metric === metric)
  const unitT = (u, metric) => sumWhere(targets, (t) => t.unit_id === u.id && !t.profile_id && t.metric === metric)
  const people = (u, metric) => sumWhere(targets, (t) => t.unit_id === u.id && t.profile_id && t.metric === metric)

  // personal targets vs their unit
  for (const u of units) {
    const metrics = new Set(targets.filter((t) => t.unit_id === u.id).map((t) => t.metric))
    for (const m of metrics) {
      const g = gap(`${u.name}: личные планы`, unitT(u, m), people(u, m), MONEY.has(m) ? 'money' : 'count', 'unit')
      if (g) out.push({ ...g, unit_id: u.id, metric: m })
    }
  }

  // units vs the department (unit level, else the sum of its people)
  const unitOrPeople = (u, m) => unitT(u, m) ?? people(u, m)
  const ofKind = (kind) => units.filter((u) => u.kind === kind)
  const sumUnits = (kind, m) => {
    const vals = ofKind(kind).map((u) => unitOrPeople(u, m)).filter((v) => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null
  }
  const subSales = [sumUnits('consultations', 'sales'), sumUnits('account', 'repeat_sales')].filter((v) => v != null)
  const subRevenue = [sumUnits('consultations', 'revenue'), sumUnits('account', 'repeat_revenue')].filter((v) => v != null)
  const g1 = gap('Подотделы → отдел: продажи', dept('sales'), subSales.length ? subSales.reduce((a, b) => a + b, 0) : null, 'count', 'department')
  const g2 = gap('Подотделы → отдел: выручка', dept('revenue'), subRevenue.length ? subRevenue.reduce((a, b) => a + b, 0) : null, 'money', 'department')
  const g3 = gap('Лид-центр → отдел: встречи', dept('held'), sumUnits('lead_center', 'held'), 'count', 'department')
  for (const g of [g1, g2, g3]) if (g) out.push(g)

  // department vs Коммерция (all brands)
  if (commerceTotals) {
    const g4 = gap('Отдел → Коммерция: продажи', commerceTotals.orders, dept('sales'), 'count', 'commerce')
    const g5 = gap('Отдел → Коммерция: выручка', commerceTotals.revenue, dept('revenue'), 'money', 'commerce')
    for (const g of [g4, g5]) if (g) out.push(g)
  }
  return out
}

// Sum of approved commerce plans (every brand and branch).
export function commerceTotalsOf(commercePlans) {
  let orders = 0
  let revenue = 0
  for (const p of commercePlans) {
    orders += Number(p.computed?.grandTotal?.orders) || 0
    revenue += Number(p.computed?.grandTotal?.revenue) || 0
  }
  return commercePlans.length ? { orders, revenue } : null
}
