import { supabase } from '../supabaseClient'

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session))
  return () => data.subscription.unsubscribe()
}

// Loads the profile row + role (caps, scope) + personal branch ids for a user.
export async function loadProfile(userId) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, is_active, role:roles(id, name, caps, scope_type)')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  if (!profile) return null

  const { data: pb } = await supabase
    .from('profile_branches')
    .select('branch_id')
    .eq('profile_id', userId)

  return {
    id: profile.id,
    fullName: profile.full_name,
    isActive: profile.is_active,
    role: profile.role,
    caps: profile.role?.caps ?? [],
    branchIds: (pb ?? []).map((r) => r.branch_id),
  }
}
