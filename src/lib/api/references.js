import { supabase } from '../supabaseClient'
import { logChange } from './audit'

// Generic CRUD over the dictionary tables. `table` is the Postgres table name.

export async function listRef(table, { includeArchived = false, select = '*' } = {}) {
  let query = supabase.from(table).select(select).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  if (!includeArchived) query = query.eq('is_archived', false)
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
