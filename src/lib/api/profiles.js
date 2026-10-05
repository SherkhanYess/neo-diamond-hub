import { supabase } from '../supabaseClient'
import { logChange } from './audit'

// Create a user via the create-user edge function (server-side admin).
export async function createUser({ email, full_name, password, role_id, branch_ids }) {
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: { email, full_name, password, role_id, branch_ids },
  })
  if (error) {
    // Edge errors carry the server message in context.
    let msg = 'Не удалось создать пользователя'
    try {
      const body = await error.context?.json?.()
      if (body?.error) msg = body.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export async function listProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, is_active, role:roles(id, name)')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function updateProfile(id, patch, actorId) {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', id).select().single()
  if (error) throw error
  await logChange(actorId, 'profiles', id, 'update', patch)
  return data
}

export async function setActive(id, isActive, actorId) {
  return updateProfile(id, { is_active: isActive }, actorId)
}

export async function listProfileBranches(profileId) {
  const { data, error } = await supabase.from('profile_branches').select('branch_id').eq('profile_id', profileId)
  if (error) throw error
  return (data ?? []).map((r) => r.branch_id)
}

export async function setProfileBranches(profileId, branchIds, actorId) {
  await supabase.from('profile_branches').delete().eq('profile_id', profileId)
  if (branchIds.length) {
    const rows = branchIds.map((branch_id) => ({ profile_id: profileId, branch_id }))
    const { error } = await supabase.from('profile_branches').insert(rows)
    if (error) throw error
  }
  await logChange(actorId, 'profile_branches', profileId, 'update', { branchIds })
}
