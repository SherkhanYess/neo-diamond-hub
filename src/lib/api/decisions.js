import { supabase } from '../supabaseClient'
import { logChange } from './audit'

export const DECISION_TYPES = [
  { key: 'scale', label: 'Масштабировать' },
  { key: 'keep', label: 'Оставить' },
  { key: 'change', label: 'Изменить' },
  { key: 'stop', label: 'Остановить' },
]

export const OUTCOMES = [
  { key: 'worked', label: 'Сработало' },
  { key: 'failed', label: 'Не сработало' },
  { key: 'partial', label: 'Частично' },
]

export async function listDecisions() {
  const { data, error } = await supabase
    .from('decisions')
    .select('*, owner:profiles!decisions_owner_id_fkey(full_name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createDecision(payload, actorId) {
  const { data, error } = await supabase
    .from('decisions')
    .insert({ ...payload, created_by: actorId })
    .select()
    .single()
  if (error) throw error
  await logChange(actorId, 'decisions', data.id, 'create', { type: payload.decision_type })
  return data
}

export async function setOutcome(id, patch, actorId) {
  const { data, error } = await supabase.from('decisions').update(patch).eq('id', id).select().single()
  if (error) throw error
  await logChange(actorId, 'decisions', id, 'update', patch)
  return data
}

// Overdue = check date reached/passed and no outcome yet.
export function isOverdue(d, today = new Date()) {
  if (d.outcome) return false
  if (!d.check_date) return false
  return new Date(d.check_date) <= today
}
