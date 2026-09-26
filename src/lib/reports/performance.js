// Performance metrics joining ad-cabinet data with CRM deals by ad external id.
// Pure functions. `qualStageId` identifies the qualification stage.

// Set of deal ids that reached qualification, from stage events.
export function qualifiedDealIds(events, qualStageId) {
  const s = new Set()
  for (const e of events) if (e.stage_id === qualStageId) s.add(e.deal_id)
  return s
}

// Per-ad CRM metrics. `ads` are level='ad' entities. `deals` is the cohort.
export function adMetrics(ads, deals, qualifiedIds, minQuals) {
  const byAdId = new Map()
  for (const d of deals) {
    if (!d.ad_id) continue
    if (!byAdId.has(d.ad_id)) byAdId.set(d.ad_id, [])
    byAdId.get(d.ad_id).push(d)
  }

  return ads.map((ad) => {
    const ds = byAdId.get(ad.external_id) || []
    const leads = ds.length
    const quals = ds.filter((d) => qualifiedIds.has(d.id)).length
    const ignored = ds.filter((d) => d.is_ignored).length
    const taskBreakdown = {}
    for (const d of ds) {
      if (!qualifiedIds.has(d.id) || !d.client_task_id) continue
      taskBreakdown[d.client_task_id] = (taskBreakdown[d.client_task_id] || 0) + 1
    }
    return {
      ad_id: ad.id,
      external_id: ad.external_id,
      name: ad.name,
      preview_url: ad.preview_url,
      spend: Number(ad.spend) || 0,
      impressions: ad.impressions || 0,
      clicks: ad.clicks || 0,
      leads,
      quals,
      cost_per_qual: quals > 0 ? (Number(ad.spend) || 0) / quals : null,
      ignore_rate: leads > 0 ? ignored / leads : null,
      task_breakdown: taskBreakdown,
      low_data: quals < minQuals,
    }
  })
}

// Deals with Performance demand source but no ad_id -> "Без объявления".
export function withoutAd(deals, performanceSourceId, qualifiedIds) {
  const ds = deals.filter((d) => d.demand_source_id === performanceSourceId && !d.ad_id)
  const quals = ds.filter((d) => qualifiedIds.has(d.id)).length
  return { leads: ds.length, quals }
}

// Roll ad-level metrics up to a parent (group/campaign) by summing.
export function rollUp(children) {
  const spend = children.reduce((s, c) => s + c.spend, 0)
  const leads = children.reduce((s, c) => s + c.leads, 0)
  const quals = children.reduce((s, c) => s + c.quals, 0)
  const ignored = children.reduce((s, c) => s + (c.ignore_rate != null ? c.ignore_rate * c.leads : 0), 0)
  return {
    spend,
    leads,
    quals,
    cost_per_qual: quals > 0 ? spend / quals : null,
    ignore_rate: leads > 0 ? ignored / leads : null,
  }
}
