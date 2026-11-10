// Row model for the day/week plan-fact table ("рука на пульсе").
// Коммерция: full РнП — from money in (вложения) through the funnel to money out
// (выручка, ROAS). Отдел продаж: the same table without any budget rows.
//
// A row: { key, label, fmt, plan, fact, bucket(keys) → fact of the period,
//          daily (show plan ÷ days), additive (pace applies), lowerBetter, cv }.
import { funnelSeries, sumOverKeys, dayKey } from '../reports/timeseries'
import { stageCountsBackward } from '../planning/calc'

const div = (a, b) => (a != null && b ? a / b : null)
const sumMap = (m) => (m ? [...m.values()].reduce((s, v) => s + v, 0) : 0)

// Core stages: from the first one to the sale stage.
export function coreStages(orderedStages) {
  const sale = orderedStages.find((s) => s.is_sale)
  return orderedStages.filter((s) => s.sort_order <= (sale?.sort_order ?? Infinity))
}

// Planned count per stage: rolled back from planned sales through the plan's
// conversions, summed over plans (brand × branch). Explicit counts win.
export function plannedStageCounts(plans, orderedStages, explicit = {}) {
  const ids = coreStages(orderedStages).map((s) => s.id)
  const out = {}
  for (const p of plans) {
    const conv = {}
    for (const c of p.conversions || []) conv[`${c.from_stage_id}>${c.to_stage_id}`] = Number(c.rate)
    if (!Object.keys(conv).length) continue
    const counts = stageCountsBackward(ids, conv, p.orders ?? 0)
    for (const [k, v] of Object.entries(counts)) out[k] = (out[k] || 0) + v
  }
  for (const [k, v] of Object.entries(explicit)) if (v != null) out[k] = v
  return out
}

// Funnel rows: stage counts with CV between consecutive stages, overall CV,
// then sales and revenue.
export function funnelRows({ deals, events, orderedStages, stagePlans = {}, ratePlans = {}, revenuePlan = null }) {
  const stages = coreStages(orderedStages)
  const series = funnelSeries(deals, events, { saleStageId: stages.find((s) => s.is_sale)?.id ?? null })
  const factStage = (id) => sumMap(series.byStageDay.get(id))
  const bucketStage = (id, keys) => sumOverKeys(series.byStageDay.get(id), keys)
  const revBucket = (keys) => keys.reduce((s, k) => s + (series.salesByDay.get(k)?.revenue || 0), 0)
  const revFact = [...series.salesByDay.values()].reduce((s, v) => s + v.revenue, 0)

  const planRate = (from, to) => {
    if (ratePlans[`${from}>${to}`] != null) return ratePlans[`${from}>${to}`]
    const a = stagePlans[from]
    const b = stagePlans[to]
    return a && b != null ? b / a : null
  }

  const rows = []
  stages.forEach((s, i) => {
    rows.push({
      key: s.id,
      label: s.name,
      fmt: 'num1',
      plan: stagePlans[s.id] ?? null,
      fact: factStage(s.id),
      bucket: (keys) => bucketStage(s.id, keys),
      daily: true,
      additive: true,
    })
    if (i === 0) {
      // Повторные обращения: тот же клиент пришёл снова (с любого конвертера).
      // Не лид и не входит в конверсии; продажа по ним — в строке продаж.
      rows.push({
        key: 'repeats',
        label: 'Повторные обращения',
        fmt: 'num1',
        plan: null,
        fact: sumMap(series.repeatsByDay),
        bucket: (keys) => sumOverKeys(series.repeatsByDay, keys),
        additive: true,
      })
    }
    const next = stages[i + 1]
    if (next) {
      rows.push({
        key: `cv:${s.id}>${next.id}`,
        label: `CV: ${s.name} → ${next.name}`,
        fmt: 'pct',
        cv: true,
        plan: planRate(s.id, next.id),
        fact: div(factStage(next.id), factStage(s.id)),
        bucket: (keys) => div(bucketStage(next.id, keys), bucketStage(s.id, keys)),
      })
    }
  })
  const first = stages[0]
  const sale = stages.find((s) => s.is_sale)
  if (first && sale && first !== sale) {
    rows.push({
      key: 'cv:overall',
      label: 'Общая конверсия',
      fmt: 'pct',
      cv: true,
      plan: div(stagePlans[sale.id], stagePlans[first.id]),
      fact: div(factStage(sale.id), factStage(first.id)),
      bucket: (keys) => div(bucketStage(sale.id, keys), bucketStage(first.id, keys)),
    })
  }
  rows.push({
    key: 'revenue',
    label: 'Выручка',
    fmt: 'money',
    plan: revenuePlan,
    fact: revFact,
    bucket: revBucket,
    daily: true,
    additive: true,
  })
  const salesPlan = sale ? stagePlans[sale.id] ?? null : null
  rows.push({
    key: 'avg_check',
    label: 'Средний чек',
    fmt: 'money',
    plan: div(revenuePlan, salesPlan),
    fact: sale ? div(revFact, factStage(sale.id)) : null,
    bucket: (keys) => (sale ? div(revBucket(keys), bucketStage(sale.id, keys)) : null),
  })
  return { rows, factStage, bucketStage, revFact, revBucket, stages, sale, first }
}

// Spend per day from cabinet stats and manual entries.
export function spendByDay(adStats, manual) {
  const m = new Map()
  const add = (day, v) => {
    const k = dayKey(day)
    m.set(k, (m.get(k) || 0) + v)
  }
  for (const r of adStats) add(r.day, Number(r.spend) || 0)
  for (const r of manual) add(r.spent_on, Number(r.amount) || 0)
  return m
}

// Full РнП for Коммерция: budget first, then the funnel, then return on it.
// budget: { plan, fact (null = н/д), byDay: Map, scale } — scale spreads a
// task-level share of spend over the days in the same proportion.
export function commerceRows({ funnel, budget, qualStageId }) {
  const { rows, factStage, bucketStage, revFact, revBucket, first, sale } = funnel
  const known = budget.fact != null
  const scale = budget.scale ?? 1
  const spendBucket = (keys) => (known ? sumOverKeys(budget.byDay, keys) * scale : null)
  const plan = (key) => rows.find((r) => r.key === key)?.plan ?? null

  const costRow = (key, label, stageId) => ({
    key,
    label,
    fmt: 'money',
    lowerBetter: true,
    plan: div(budget.plan, plan(stageId)),
    fact: known ? div(budget.fact, factStage(stageId)) : null,
    bucket: (keys) => div(spendBucket(keys), bucketStage(stageId, keys)),
  })

  const head = [
    {
      key: 'budget',
      label: 'Вложения',
      fmt: 'money',
      lowerBetter: true,
      plan: budget.plan,
      fact: known ? budget.fact : null,
      bucket: spendBucket,
      daily: true,
      additive: true,
      group: 'money',
    },
  ]
  if (first) head.push(costRow('cpl', `Стоимость: ${first.name.toLowerCase()}`, first.id))
  if (qualStageId && qualStageId !== first?.id) head.push(costRow('cpq', 'Стоимость квал-лида', qualStageId))

  const tail = [
    sale && { ...costRow('cac', 'CAC (стоимость продажи)', sale.id) },
    {
      key: 'roas',
      label: 'ROAS',
      fmt: 'ratio1',
      plan: div(plan('revenue'), budget.plan),
      fact: known ? div(revFact, budget.fact) : null,
      bucket: (keys) => div(revBucket(keys), spendBucket(keys)),
    },
  ].filter(Boolean)
  const body = rows.map((r, i) =>
    i === 0 ? { ...r, section: 'Воронка' } : r.key === 'revenue' ? { ...r, section: 'Отдача' } : r
  )
  head[0].section = 'Вложения'
  return [...head, ...body, ...tail]
}

// Fact vs plan → 'good' | 'bad' | ''. Additive volumes in the running month
// are judged against plan × elapsed share (pace).
export function pulseTone(row, pace = 1, thresholds = { low: 90, high: 100 }) {
  if (row.plan == null || !row.plan || row.fact == null) return ''
  const target = row.additive && pace > 0 && pace < 1 ? row.plan * pace : row.plan
  const pct = (row.fact / target) * 100
  if (row.lowerBetter) return pct <= 100 ? 'good' : pct > 110 ? 'bad' : ''
  if (pct >= thresholds.high) return 'good'
  if (pct < thresholds.low) return 'bad'
  return ''
}
