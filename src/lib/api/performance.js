import { supabase } from '../supabaseClient'

export async function loadAdEntities(cabinet = null) {
  let q = supabase.from('ad_entities').select('*').order('level').order('name')
  if (cabinet) q = q.eq('cabinet', cabinet)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function loadAdTags() {
  const [{ data: tags }, { data: links }] = await Promise.all([
    supabase.from('creative_tags').select('*').eq('is_archived', false).order('sort_order'),
    supabase.from('ad_tags').select('*'),
  ])
  return { tags: tags ?? [], links: links ?? [] }
}

// Build campaign → group → ad tree from a flat list.
export function buildAdTree(entities) {
  const byId = new Map(entities.map((e) => [e.id, { ...e, children: [] }]))
  const roots = []
  for (const e of byId.values()) {
    if (e.parent_id && byId.has(e.parent_id)) byId.get(e.parent_id).children.push(e)
    else if (e.level === 'campaign') roots.push(e)
  }
  return roots
}

export function flatAds(entities) {
  return entities.filter((e) => e.level === 'ad')
}
