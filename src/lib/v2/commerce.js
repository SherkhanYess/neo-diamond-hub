// Коммерция: brand → client task → demand source, plan vs fact.
// Built as leaves (brand × task × source) so any hierarchy can be rolled up
// from the same numbers.
import { UNKNOWN, emptySums, addSums, derive, planSums, dealSums, reachedStages } from './metrics'

export const UNALLOCATED = '__unallocated__' // spend that cannot be tied to a task

const key = (b, t, s) => `${b}|${t}|${s}`

function leafMap() {
  const m = new Map()
  const get = (b, t, s) => {
    const k = key(b, t, s)
    if (!m.has(k)) m.set(k, { brand_id: b, task_id: t, source_id: s, plan: emptySums(), fact: emptySums() })
    return m.get(k)
  }
  return { m, get }
}

// spendBySource: Map "brand:source" → amount. spendBrands: Set of brands that
// have any spend data in the period (otherwise budget fact is н/д, not 0).
export function commerceLeaves({ deals, events, plans, spendBySource, spendBrands, stages }) {
  const { m, get } = leafMap()
  const reached = reachedStages(events)

  for (const d of deals) {
    const leaf = get(d.brand_id, d.client_task_id ?? UNKNOWN, d.demand_source_id ?? UNKNOWN)
    leaf.fact = addSums(leaf.fact, dealSums(d, reached, stages))
  }
  for (const p of plans) {
    for (const r of p.computed?.rows || []) {
      const leaf = get(p.brand_id, r.client_task_id, r.demand_source_id)
      leaf.plan = addSums(leaf.plan, planSums(r))
    }
  }

  // Allocate each source's spend across tasks: by qualified leads, else by
  // planned budget, else leave it unallocated (still counted for the brand).
  for (const [k, amount] of spendBySource) {
    if (!amount) continue
    const [brand, source] = k.split(':')
    const siblings = [...m.values()].filter(
      (l) => l.brand_id === brand && l.source_id === source && l.task_id !== UNKNOWN
    )
    let weights = siblings.map((l) => l.fact.quals)
    if (!weights.some((w) => w > 0)) weights = siblings.map((l) => l.plan.budget)
    const total = weights.reduce((a, b) => a + b, 0)
    if (total > 0) {
      siblings.forEach((l, i) => {
        l.fact.budget += (amount * weights[i]) / total
      })
    } else {
      get(brand, UNALLOCATED, source).fact.budget += amount
    }
  }

  for (const l of m.values()) {
    l.fact.budgetKnown = spendBrands.has(l.brand_id)
  }
  return [...m.values()]
}

// Roll leaves up along `levels`, e.g. ['brand_id', 'task_id', 'source_id'].
export function buildTree(leaves, levels) {
  const [level, ...rest] = levels
  const groups = new Map()
  for (const l of leaves) {
    const id = l[level]
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id).push(l)
  }
  const nodes = [...groups.entries()].map(([id, ls]) => {
    const plan = ls.reduce((a, l) => addSums(a, l.plan), emptySums())
    const fact = ls.reduce((a, l) => addSums(a, l.fact), emptySums())
    return {
      key: `${level}:${id}`,
      level,
      id,
      plan,
      fact,
      planM: derive(plan),
      factM: derive(fact),
      children: rest.length ? buildTree(ls, rest) : null,
    }
  })
  // Special buckets last; otherwise by revenue (fact, then plan).
  const special = (n) => (n.id === UNKNOWN || n.id === UNALLOCATED ? 1 : 0)
  return nodes.sort(
    (a, b) => special(a) - special(b) || b.fact.revenue - a.fact.revenue || b.plan.revenue - a.plan.revenue
  )
}

export function totals(leaves) {
  const plan = leaves.reduce((a, l) => addSums(a, l.plan), emptySums())
  const fact = leaves.reduce((a, l) => addSums(a, l.fact), emptySums())
  return { plan, fact, planM: derive(plan), factM: derive(fact) }
}
