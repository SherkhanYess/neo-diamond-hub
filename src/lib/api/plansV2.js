import { supabase } from '../supabaseClient'
import { logChange } from './audit'

// Versioned plans of the v2 levels: 'marketing' (per brand, converter lines)
// and 'sales' (department, targets). Same lifecycle as the commerce plan:
// draft → approved; changing an approved plan creates version + 1 with a reason.

const LINES = {
  marketing: { table: 'plan_converter_lines', cols: 'converter_id, budget, leads, quals' },
  sales: { table: 'plan_sales_targets', cols: 'unit_id, profile_id, metric, value' },
}

function scoped(q, kind, brandId) {
  q = q.eq('kind', kind)
  return kind === 'marketing' ? q.eq('brand_id', brandId) : q.is('brand_id', null)
}

// Open draft if there is one, else the latest approved version, with lines.
export async function loadKindPlan(kind, month, brandId = null) {
  const { data, error } = await scoped(supabase.from('plans').select('*').eq('month', month), kind, brandId).order('version', {
    ascending: false,
  })
  if (error) throw error
  if (!data?.length) return null
  const plan = data.find((p) => p.status === 'draft') || data[0]
  const { data: lines } = await supabase.from(LINES[kind].table).select(LINES[kind].cols).eq('plan_id', plan.id)
  return { plan, lines: lines ?? [], versions: data.map((p) => ({ id: p.id, version: p.version, status: p.status, reason: p.reason })) }
}

export async function createKindDraft(kind, month, brandId, actorId, { version = 1, lines = [] } = {}) {
  const { data: plan, error } = await supabase
    .from('plans')
    .insert({
      kind,
      month,
      brand_id: kind === 'marketing' ? brandId : null,
      branch_id: null,
      version,
      status: 'draft',
      created_by: actorId,
    })
    .select()
    .single()
  if (error) throw error
  if (lines.length) {
    const { error: e2 } = await supabase.from(LINES[kind].table).insert(lines.map((l) => ({ ...l, plan_id: plan.id })))
    if (e2) throw e2
  }
  await logChange(actorId, 'plans', plan.id, 'create', { kind, month, brand_id: plan.brand_id, version })
  return loadKindPlan(kind, month, brandId)
}

export async function saveConverterLine(planId, converterId, patch) {
  const { error } = await supabase
    .from('plan_converter_lines')
    .upsert({ plan_id: planId, converter_id: converterId, ...patch }, { onConflict: 'plan_id,converter_id' })
  if (error) throw error
}

// Targets have a coalesce() unique index, so update-or-insert by hand.
export async function saveTarget(planId, unitId, profileId, metric, value) {
  let q = supabase.from('plan_sales_targets').select('id').eq('plan_id', planId).eq('metric', metric)
  q = unitId ? q.eq('unit_id', unitId) : q.is('unit_id', null)
  q = profileId ? q.eq('profile_id', profileId) : q.is('profile_id', null)
  const { data } = await q.maybeSingle()
  if (value === null || value === '' || Number.isNaN(value)) {
    if (data) await supabase.from('plan_sales_targets').delete().eq('id', data.id)
    return
  }
  if (data) {
    const { error } = await supabase.from('plan_sales_targets').update({ value }).eq('id', data.id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('plan_sales_targets')
      .insert({ plan_id: planId, unit_id: unitId, profile_id: profileId, metric, value })
    if (error) throw error
  }
}

export async function approveKindPlan(plan, actorId, reason = null) {
  const { error } = await supabase
    .from('plans')
    .update({
      status: 'approved',
      approved_by: actorId,
      approved_at: new Date().toISOString(),
      reason: plan.version > 1 ? reason : null,
    })
    .eq('id', plan.id)
  if (error) throw error
  await logChange(actorId, 'plans', plan.id, 'update', { status: 'approved', kind: plan.kind, version: plan.version, reason })
}

// «Изменить план»: a new draft version carrying the approved lines over.
export async function newKindVersion(kind, month, brandId, actorId) {
  const current = await loadKindPlan(kind, month, brandId)
  if (!current) throw new Error('Нет плана для новой версии')
  const top = Math.max(...current.versions.map((v) => v.version))
  return createKindDraft(kind, month, brandId, actorId, { version: top + 1, lines: current.lines })
}

export async function copyKindFromPrevious(kind, month, brandId, actorId) {
  const prev = new Date(month)
  prev.setUTCMonth(prev.getUTCMonth() - 1)
  const prevMonth = prev.toISOString().slice(0, 10)
  const last = await loadKindPlan(kind, prevMonth, brandId)
  if (!last) throw new Error('За прошлый месяц плана нет')
  return createKindDraft(kind, month, brandId, actorId, { lines: last.lines })
}
