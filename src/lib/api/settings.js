import { supabase } from '../supabaseClient'
import { logChange } from './audit'

export async function getDisplaySettings() {
  const { data, error } = await supabase.from('display_settings').select('*').eq('id', 1).maybeSingle()
  if (error) throw error
  return data
}

export async function updateDisplaySettings(patch, actorId) {
  const { data, error } = await supabase
    .from('display_settings')
    .update(patch)
    .eq('id', 1)
    .select()
    .single()
  if (error) throw error
  await logChange(actorId, 'display_settings', null, 'update', patch)
  return data
}
