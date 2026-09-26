import { supabase } from '../supabaseClient'
import { logChange } from './audit'

export async function listRoles() {
  const { data, error } = await supabase
    .from('roles')
    .select('id, name, is_system, caps, scope_type, is_archived, sort_order')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function listRoleBranches(roleId) {
  const { data, error } = await supabase.from('role_branches').select('branch_id').eq('role_id', roleId)
  if (error) throw error
  return (data ?? []).map((r) => r.branch_id)
}

export async function createRole({ name, caps, scope_type }, actorId) {
  const { data, error } = await supabase
    .from('roles')
    .insert({ name, caps, scope_type, is_system: false })
    .select()
    .single()
  if (error) throw error
  await logChange(actorId, 'roles', data.id, 'create', { name, caps, scope_type })
  return data
}

export async function updateRole(id, patch, actorId) {
  const { data, error } = await supabase.from('roles').update(patch).eq('id', id).select().single()
  if (error) throw error
  await logChange(actorId, 'roles', id, 'update', patch)
  return data
}

export async function setRoleBranches(roleId, branchIds, actorId) {
  await supabase.from('role_branches').delete().eq('role_id', roleId)
  if (branchIds.length) {
    const rows = branchIds.map((branch_id) => ({ role_id: roleId, branch_id }))
    const { error } = await supabase.from('role_branches').insert(rows)
    if (error) throw error
  }
  await logChange(actorId, 'role_branches', roleId, 'update', { branchIds })
}

export async function deleteRole(id, actorId) {
  const { error } = await supabase.from('roles').delete().eq('id', id)
  if (error) throw error
  await logChange(actorId, 'roles', id, 'delete', {})
}
