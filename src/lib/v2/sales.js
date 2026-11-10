// Отдел продаж: built from people. A deal is credited by stage to whoever
// owned that stage — lead manager (up to the meeting), consultant (the sale),
// account manager (a repeat sale). Units sum their members; the department
// sums its units. Pure functions.
import { reachedStages, isWon } from './metrics'

export const SALES_METRICS = {
  leads: { label: 'Обращения', fmt: 'int', additive: true },
  quals: { label: 'Квал-лиды', fmt: 'int', additive: true },
  set: { label: 'Встреч назначено', fmt: 'int', additive: true },
  held: { label: 'Встреч проведено', fmt: 'int', additive: true },
  sales: { label: 'Продажи', fmt: 'int', additive: true },
  revenue: { label: 'Выручка', fmt: 'money', additive: true },
  repeat_sales: { label: 'Повторные продажи', fmt: 'int', additive: true },
  repeat_revenue: { label: 'Выручка с базы', fmt: 'money', additive: true },
  avg_check: { label: 'Средний чек', fmt: 'money' },
  cr_lead_qual: { label: 'Лид → квал', fmt: 'pct' },
  cr_qual_set: { label: 'Квал → назначена', fmt: 'pct' },
  cr_set_held: { label: 'Назначена → состоялась', fmt: 'pct' },
  cr_held_sale: { label: 'Встреча → продажа', fmt: 'pct' },
  first_response: { label: 'Первый ответ, мин', fmt: 'int', lowerBetter: true, hint: 'Медиана минут до первого ответа' },
}

export const UNIT_KINDS = {
  lead_center: 'Лид-центр',
  consultations: 'Консультации',
  account: 'Аккаунт-менеджеры',
  other: 'Другое',
}

// Deals a person is credited with inside a unit of the given kind.
export function credited(deals, kind, profileId) {
  switch (kind) {
    case 'lead_center':
      return deals.filter((d) => d.lead_manager_id === profileId)
    case 'consultations':
      return deals.filter((d) => d.consultant_id === profileId && !d.is_repeat)
    case 'account':
      return deals.filter((d) => d.account_manager_id === profileId && d.is_repeat)
    default:
      return deals.filter((d) => [d.lead_manager_id, d.consultant_id, d.account_manager_id].includes(profileId))
  }
}

export function median(values) {
  const a = values.filter((v) => v != null).sort((x, y) => x - y)
  if (!a.length) return null
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

const div = (a, b) => (b ? a / b : null)

// Raw counts for a set of deals (unique by id).
export function counts(deals, reached, stages) {
  const seen = new Set()
  const c = { leads: 0, quals: 0, set: 0, held: 0, sales: 0, revenue: 0, repeat_sales: 0, repeat_revenue: 0, repeats: 0, responses: [] }
  for (const d of deals) {
    if (seen.has(d.id)) continue
    seen.add(d.id)
    const r = reached.get(d.id) || new Set()
    // Повторное обращение клиента — не лид: в воронку не входит, продажа считается.
    if (d.is_unique === false) {
      c.repeats++
    } else {
      c.leads++
      if (r.has(stages.qual) || d.client_task_id) c.quals++
      if (r.has(stages.set)) c.set++
      if (r.has(stages.held)) c.held++
    }
    if (isWon(d)) {
      if (d.is_repeat) {
        c.repeat_sales++
        c.repeat_revenue += Number(d.revenue) || 0
      } else {
        c.sales++
        c.revenue += Number(d.revenue) || 0
      }
    }
    if (d.first_response_minutes != null) c.responses.push(d.first_response_minutes)
  }
  return c
}

export function deriveSales(c) {
  return {
    leads: c.leads,
    quals: c.quals,
    set: c.set,
    held: c.held,
    sales: c.sales,
    revenue: c.revenue,
    repeat_sales: c.repeat_sales,
    repeat_revenue: c.repeat_revenue,
    repeats: c.repeats,
    avg_check: div(c.revenue + c.repeat_revenue, c.sales + c.repeat_sales),
    cr_lead_qual: div(c.quals, c.leads),
    cr_qual_set: div(c.set, c.quals),
    cr_set_held: div(c.held, c.set),
    cr_held_sale: div(c.sales + c.repeat_sales, c.held),
    first_response: median(c.responses),
  }
}

// targets: [{ unit_id, profile_id, metric, value }]
export function targetsOf(targets, unitId, profileId) {
  const out = {}
  for (const t of targets) {
    if ((t.unit_id ?? null) === (unitId ?? null) && (t.profile_id ?? null) === (profileId ?? null)) {
      out[t.metric] = Number(t.value)
    }
  }
  return out
}

function sumTargets(list) {
  const out = {}
  for (const t of list) for (const [k, v] of Object.entries(t)) out[k] = (out[k] || 0) + v
  return out
}

// One unit: a row per member (personal plan/fact) and the unit total.
export function unitReport({ unit, memberIds, deals, events, stages, targets = [] }) {
  const reached = reachedStages(events)
  const rows = memberIds.map((pid) => {
    const mine = credited(deals, unit.kind, pid)
    return { profile_id: pid, fact: deriveSales(counts(mine, reached, stages)), plan: targetsOf(targets, unit.id, pid) }
  })
  const all = memberIds.flatMap((pid) => credited(deals, unit.kind, pid))
  const unitPlan = targetsOf(targets, unit.id, null)
  const peoplePlan = sumTargets(rows.map((r) => r.plan))
  return {
    unit,
    rows,
    // per metric: the unit's own target, else the sum of its people's targets
    total: { fact: deriveSales(counts(all, reached, stages)), plan: { ...peoplePlan, ...unitPlan } },
    peoplePlan,
    unitPlan,
  }
}

// The whole department: every unit plus the general picture from all deals,
// and what no unit member is credited with (so nothing is lost silently).
export function departmentReport({ units, members, deals, events, stages, targets = [] }) {
  const reached = reachedStages(events)
  const reports = units.map((u) =>
    unitReport({ unit: u, memberIds: members.filter((m) => m.unit_id === u.id).map((m) => m.profile_id), deals, events, stages, targets })
  )
  const general = deriveSales(counts(deals, reached, stages))
  const memberOf = (kind) =>
    new Set(members.filter((m) => units.find((u) => u.id === m.unit_id)?.kind === kind).map((m) => m.profile_id))
  const lead = memberOf('lead_center')
  const cons = memberOf('consultations')
  const acc = memberOf('account')
  const gaps = {
    held_without_lead: deals.filter((d) => reached.get(d.id)?.has(stages.held) && !d.is_repeat && !lead.has(d.lead_manager_id)).length,
    sales_without_consultant: deals.filter((d) => isWon(d) && !d.is_repeat && !cons.has(d.consultant_id)).length,
    repeat_without_account: deals.filter((d) => isWon(d) && d.is_repeat && !acc.has(d.account_manager_id)).length,
  }
  return { units: reports, general, plan: targetsOf(targets, null, null), gaps }
}

// Second-level split of sales by a deal field (brand_id, client_task_id).
export function salesBy(deals, field) {
  const m = new Map()
  for (const d of deals) {
    if (!isWon(d)) continue
    const k = d[field] ?? '__none__'
    const cur = m.get(k) || { key: k, sales: 0, revenue: 0 }
    cur.sales++
    cur.revenue += Number(d.revenue) || 0
    m.set(k, cur)
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue)
}
