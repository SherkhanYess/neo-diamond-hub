import { supabase } from '../supabaseClient'

export async function logChange(actorId, entity, entityId, action, diff = {}) {
  // Best-effort: never let audit failure block the user action.
  try {
    await supabase.from('audit_log').insert({
      actor_id: actorId ?? null,
      entity,
      entity_id: entityId ?? null,
      action,
      diff,
    })
  } catch {
    // swallow — audit is secondary
  }
}

export async function listAudit({ entity = null, limit = 200 } = {}) {
  let query = supabase
    .from('audit_log')
    .select('id, actor_id, entity, entity_id, action, diff, created_at, actor:profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (entity) query = query.eq('entity', entity)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}
