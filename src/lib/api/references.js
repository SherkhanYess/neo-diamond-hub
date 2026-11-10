import { supabase } from '../supabaseClient'
import { logChange } from './audit'

// Generic CRUD over the dictionary tables. `table` is the Postgres table name.

// Tables that belong to a brand (filtered by the brand switcher).
export const BRAND_SCOPED = new Set([
  'client_tasks',
  'demand_sources',
  'converters',
  'utm_rules',
  'ad_entities',
  'spend_entries',
])

export async function listRef(table, { includeArchived = false, select = '*', brandId = null } = {}) {
  let query = supabase.from(table).select(select).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  if (!includeArchived) query = query.eq('is_archived', false)
  if (brandId && BRAND_SCOPED.has(table)) query = query.eq('brand_id', brandId)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createRef(table, row, actorId) {
  const { data, error } = await supabase.from(table).insert(row).select().single()
  if (error) throw error
  await logChange(actorId, table, data.id, 'create', row)
  return data
}

export async function updateRef(table, id, patch, actorId) {
  const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().single()
  if (error) throw error
  await logChange(actorId, table, id, 'update', patch)
  return data
}

export async function archiveRef(table, id, actorId) {
  return updateRefFlag(table, id, true, actorId)
}

export async function unarchiveRef(table, id, actorId) {
  return updateRefFlag(table, id, false, actorId)
}

async function updateRefFlag(table, id, archived, actorId) {
  const { data, error } = await supabase.from(table).update({ is_archived: archived }).eq('id', id).select().single()
  if (error) throw error
  await logChange(actorId, table, id, 'archive', { is_archived: archived })
  return data
}

export async function deleteRef(table, id, actorId) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
  await logChange(actorId, table, id, 'delete', {})
}

// Where each dictionary is referenced, so we can tell "in use" from "deletable".
const DEPENDENCIES = {
  client_tasks: [
    ['deals', 'client_task_id'],
    ['plan_task_lines', 'client_task_id'],
    ['plan_source_lines', 'client_task_id'],
  ],
  demand_sources: [
    ['deals', 'demand_source_id'],
    ['plan_source_lines', 'demand_source_id'],
    ['converters', 'demand_source_id'],
    ['spend_entries', 'demand_source_id'],
    ['ad_entities', 'demand_source_id'],
  ],
  converters: [
    ['deals', 'converter_id'],
    ['utm_rules', 'converter_id'],
    ['ad_entities', 'converter_id'],
    ['spend_entries', 'converter_id'],
  ],
  brands: [
    ['deals', 'brand_id'],
    ['plans', 'brand_id'],
    ['client_tasks', 'brand_id'],
    ['demand_sources', 'brand_id'],
  ],
  lead_sources: [['deals', 'lead_source_id']],
  cities: [['branches', 'city_id']],
  branches: [
    ['deals', 'branch_id'],
    ['plans', 'branch_id'],
    ['role_branches', 'branch_id'],
    ['profile_branches', 'branch_id'],
  ],
  funnel_stages: [
    ['deal_stage_events', 'stage_id'],
    ['deals', 'current_stage_id'],
    ['plan_sales_conversions', 'from_stage_id'],
    ['plan_sales_conversions', 'to_stage_id'],
  ],
  creative_tags: [['ad_tags', 'tag_id']],
}

// True if the dictionary row is referenced anywhere (deal, plan, link table).
export async function isReferenceInUse(table, id) {
  const deps = DEPENDENCIES[table] || []
  for (const [depTable, col] of deps) {
    const { count, error } = await supabase
      .from(depTable)
      .select('*', { count: 'exact', head: true })
      .eq(col, id)
    if (error) continue // if we can't check a table, don't block on it
    if ((count ?? 0) > 0) return true
  }
  return false
}
