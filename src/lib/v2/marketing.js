// Маркетинг: demand sources → converters → ad campaigns. Pure functions over
// the same cohort/spend/plans as Коммерция.
import { UNKNOWN, emptySums, addSums, derive, planSums, dealSums, reachedStages, isWon, isUnique } from './metrics'

// Level 1 — one card per demand source of the brand.
export function sourceCards({ deals, events, plans, spendBySource, spendBrands, stages, sources }) {
  const reached = reachedStages(events)
  const fact = new Map()
  const plan = new Map()
  const bump = (m, k, s) => m.set(k, addSums(m.get(k) || emptySums(), s))

  for (const d of deals) bump(fact, `${d.brand_id}:${d.demand_source_id ?? UNKNOWN}`, dealSums(d, reached, stages))
  for (const p of plans) {
    for (const r of p.computed?.rows || []) bump(plan, `${p.brand_id}:${r.demand_source_id}`, planSums(r))
  }

  const cards = sources.map((s) => {
    const k = `${s.brand_id}:${s.id}`
    const f = { ...(fact.get(k) || emptySums()) }
    f.budget = spendBySource.get(k) || 0
    f.budgetKnown = spendBrands.has(s.brand_id)
    const p = plan.get(k) || emptySums()
    return { source: s, plan: p, fact: f, planM: derive(p), factM: derive(f) }
  })
  // Leads of deals whose source couldn't be resolved from UTM.
  const unknown = [...fact.entries()].filter(([k]) => k.endsWith(`:${UNKNOWN}`)).reduce((a, [, s]) => addSums(a, s), emptySums())
  const active = (c) => c.fact.leads || c.fact.budget || c.plan.revenue || c.plan.budget
  return {
    cards: cards.filter((c) => !c.source.is_archived || active(c)).sort((a, b) => Number(!!active(b)) - Number(!!active(a)) || b.fact.revenue - a.fact.revenue),
    unknown,
  }
}

// Funnel step counts for a set of deals.
export function funnelOf(deals, reached, stages) {
  let leads = 0, quals = 0, set = 0, held = 0, sales = 0, revenue = 0, ignored = 0, repeats = 0
  for (const d of deals) {
    const r = reached.get(d.id) || new Set()
    if (isWon(d)) {
      sales++
      revenue += Number(d.revenue) || 0
    }
    if (!isUnique(d)) {
      repeats++
      continue
    }
    leads++
    if (r.has(stages.qual) || d.client_task_id) quals++
    if (r.has(stages.set)) set++
    if (r.has(stages.held)) held++
    if (d.is_ignored) ignored++
  }
  return { leads, quals, set, held, sales, revenue, ignored, repeats }
}

const div = (a, b) => (b ? a / b : null)

// Level 2 — compare the converters of one source.
// entries: Map converter_id → entry count (visits / clicks) or undefined (н/д).
export function converterFunnels({ deals, events, stages, converters, spendByConverter, spendKnown, entries, brandId }) {
  const reached = reachedStages(events)
  const rows = converters.map((c) => {
    const ds = deals.filter((d) => d.converter_id === c.id)
    const f = funnelOf(ds, reached, stages)
    const budget = spendKnown ? spendByConverter.get(`${brandId ?? c.brand_id}:${c.id}`) || 0 : null
    const entry = entries.get(c.id)
    const hasEntry = entry != null && !(entry === 0 && f.leads > 0)
    return {
      converter: c,
      entry: hasEntry ? entry : null,
      ...f,
      budget,
      cr_entry_lead: hasEntry ? div(f.leads, entry) : null,
      cr_lead_qual: div(f.quals, f.leads),
      cr_qual_held: div(f.held, f.quals),
      cr_held_sale: div(f.sales, f.held),
      cpl: budget == null ? null : div(budget, f.leads),
      cpq: budget == null ? null : div(budget, f.quals),
      roas: budget ? div(f.revenue, budget) : null,
      ignore_share: div(f.ignored, f.leads),
    }
  })
  // Leads of this source that no converter claimed (no UTM rule matched).
  const orphan = deals.filter((d) => !d.converter_id)
  return { rows, orphan: orphan.length ? funnelOf(orphan, reached, stages) : null }
}

// Level 3 — Performance inside the source: campaign → group → ad.
// entities: ad_entities of the source; stats: daily rows (period); deals: the source's cohort.
export function performanceTree({ entities, stats, deals, events, stages, minQuals = 10 }) {
  const reached = reachedStages(events)
  const statBy = new Map()
  for (const s of stats) {
    const cur = statBy.get(s.ad_entity_id) || { spend: 0, impressions: 0, clicks: 0 }
    cur.spend += s.spend
    cur.impressions += s.impressions
    cur.clicks += s.clicks
    statBy.set(s.ad_entity_id, cur)
  }
  const dealsByAd = new Map()
  for (const d of deals) {
    if (!d.ad_id) continue
    if (!dealsByAd.has(d.ad_id)) dealsByAd.set(d.ad_id, [])
    dealsByAd.get(d.ad_id).push(d)
  }
  const children = (id) => entities.filter((e) => e.parent_id === id)

  const node = (e) => {
    const kids = e.level === 'ad' ? [] : children(e.id).map(node)
    let base
    if (e.level === 'ad') {
      const st = statBy.get(e.id) || { spend: 0, impressions: 0, clicks: 0 }
      const ds = dealsByAd.get(e.external_id) || []
      base = { ...st, ...funnelOf(ds, reached, stages) }
    } else {
      base = kids.reduce(
        (a, k) => ({
          spend: a.spend + k.spend,
          impressions: a.impressions + k.impressions,
          clicks: a.clicks + k.clicks,
          leads: a.leads + k.leads,
          quals: a.quals + k.quals,
          set: a.set + k.set,
          held: a.held + k.held,
          sales: a.sales + k.sales,
          revenue: a.revenue + k.revenue,
          ignored: a.ignored + k.ignored,
          repeats: a.repeats + (k.repeats || 0),
        }),
        { spend: 0, impressions: 0, clicks: 0, leads: 0, quals: 0, set: 0, held: 0, sales: 0, revenue: 0, ignored: 0, repeats: 0 }
      )
    }
    return {
      entity: e,
      ...base,
      ctr: div(base.clicks, base.impressions),
      cpl: div(base.spend, base.leads),
      cpq: div(base.spend, base.quals),
      roas: base.spend ? div(base.revenue, base.spend) : null,
      ignore_share: div(base.ignored, base.leads),
      low_data: base.quals < minQuals,
      children: kids,
    }
  }

  const campaigns = entities.filter((e) => e.level === 'campaign').map(node)
  const known = new Set(entities.filter((e) => e.level === 'ad').map((e) => e.external_id))
  // Leads that came through an ad converter but carry no (known) ad id.
  const noAd = deals.filter((d) => d.utm_campaign && (!d.ad_id || !known.has(d.ad_id)))
  return { campaigns, noAd: noAd.length ? funnelOf(noAd, reached, stages) : null }
}
