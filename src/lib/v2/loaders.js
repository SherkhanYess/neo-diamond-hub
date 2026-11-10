import { supabase } from '../supabaseClient'
import { fetchAll } from '../api/paging'
import { loadCohort } from '../api/reports'
import { listRef } from '../api/references'

export function monthBounds(month) {
  const d = new Date(month)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const pad = (n) => String(n).padStart(2, '0')
  const start = `${y}-${pad(m + 1)}-01`
  const ny = m === 11 ? y + 1 : y
  const nm = m === 11 ? 1 : m + 2
  return { start, end: `${ny}-${pad(nm)}-01` }
}

// Cabinet stats per day with their ad entity (brand, source, converter, hierarchy).
export async function loadAdStats(month, brandId) {
  const { start, end } = monthBounds(month)
  const rows = await fetchAll(() =>
    supabase
      .from('ad_daily_stats')
      .select(
        'day, spend, impressions, clicks, ad:ad_entities(id, parent_id, level, cabinet, name, external_id, brand_id, demand_source_id, converter_id)'
      )
      .gte('day', start)
      .lt('day', end)
  )
  return rows
    .filter((r) => r.ad && (!brandId || r.ad.brand_id === brandId))
    .map((r) => ({
      day: r.day,
      spend: Number(r.spend) || 0,
      impressions: r.impressions || 0,
      clicks: r.clicks || 0,
      ad_entity_id: r.ad.id,
      external_id: r.ad.external_id,
      brand_id: r.ad.brand_id,
      demand_source_id: r.ad.demand_source_id,
      converter_id: r.ad.converter_id,
    }))
}

export async function loadManualSpend(month, brandId) {
  const { start, end } = monthBounds(month)
  let q = supabase
    .from('spend_entries')
    .select('id, spent_on, amount, brand_id, demand_source_id, converter_id, name')
    .eq('is_archived', false)
    .gte('spent_on', start)
    .lt('spent_on', end)
  if (brandId) q = q.eq('brand_id', brandId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

// Latest approved commerce plan per (branch, brand) for the month.
export async function loadCommercePlans(month, { brandId = null, branchId = null } = {}) {
  let q = supabase
    .from('plans')
    .select('id, branch_id, brand_id, version, computed')
    .eq('month', monthBounds(month).start)
    .eq('kind', 'commerce')
    .eq('status', 'approved')
    .order('version', { ascending: false })
  if (brandId) q = q.eq('brand_id', brandId)
  if (branchId) q = q.eq('branch_id', branchId)
  const { data, error } = await q
  if (error) throw error
  const latest = new Map()
  for (const p of data ?? []) {
    const k = `${p.branch_id}|${p.brand_id}`
    if (!latest.has(k)) latest.set(k, p)
  }
  return [...latest.values()]
}

// Every ad entity of the brand (hierarchy for Performance).
export async function loadAdEntities(brandId) {
  let q = supabase
    .from('ad_entities')
    .select('id, parent_id, level, cabinet, name, external_id, brand_id, demand_source_id, converter_id')
  if (brandId) q = q.eq('brand_id', brandId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function loadDictionaries(brandId) {
  const [brands, branches, tasks, sources, converters, stages] = await Promise.all([
    supabase.from('brands').select('id, name, sort_order').eq('is_archived', false).order('sort_order').then((r) => r.data ?? []),
    listRef('branches'),
    listRef('client_tasks', { brandId, includeArchived: true }),
    listRef('demand_sources', { brandId, includeArchived: true }),
    listRef('converters', { brandId, includeArchived: true }),
    listRef('funnel_stages'),
  ])
  return { brands, branches, tasks, sources, converters, stages: [...stages].sort((a, b) => a.sort_order - b.sort_order) }
}

export { loadCohort }

// «Вход» of each converter for the month: taplink sessions, ad clicks, site
// sessions. Missing data → no entry (shown as н/д), never a fake zero.
export async function loadConverterEntries(month, converters, adStats, utmRules = []) {
  const { start, end } = monthBounds(month)
  const out = new Map()

  if (converters.some((c) => c.entry_source === 'taplink')) {
    const rows = await fetchAll(() =>
      supabase
        .from('taplink_events')
        .select('session_id')
        .eq('event_type', 'page_view')
        .gte('created_at', start)
        .lt('created_at', end)
    ).catch(() => null)
    if (rows) {
      const sessions = new Set(rows.map((r) => r.session_id)).size
      for (const c of converters) if (c.entry_source === 'taplink') out.set(c.id, sessions)
    }
  }

  for (const c of converters) {
    if (c.entry_source !== 'ads') continue
    out.set(c.id, adStats.filter((r) => r.converter_id === c.id).reduce((a, r) => a + r.clicks, 0))
  }

  const siteConverters = converters.filter((c) => c.entry_source === 'site')
  for (const c of siteConverters) {
    const channel = utmRules.find((r) => r.converter_id === c.id && r.match_source)?.match_source
    if (!channel) continue
    const { data, error } = await supabase
      .from('site_events')
      .select('session_id')
      .ilike('utm_source', channel.replace(/\*/g, '%'))
      .gte('created_at', start)
      .lt('created_at', end)
      .limit(50000)
    if (error) break // the storefront events table is not available in this project
    out.set(c.id, new Set((data ?? []).map((r) => r.session_id)).size)
  }
  return out
}

export async function loadUtmRules(brandId) {
  return listRef('utm_rules', { brandId })
}
