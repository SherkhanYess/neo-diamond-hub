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
