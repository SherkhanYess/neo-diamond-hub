import { supabase } from '../supabaseClient'
import { logChange } from './audit'
import { computeMarketing } from '../planning/calc'

// A "plan bundle" = the plans row plus its input lines and conversions.

export async function loadLatestPlan(branchId, month) {
  const { data: plans, error } = await supabase
    .from('plans')
    .select('*')
    .eq('branch_id', branchId)
    .eq('month', month)
    .order('version', { ascending: false })
  if (error) throw error
  if (!plans || plans.length === 0) return null
  // Prefer an open draft; otherwise the highest approved version.
  const draft = plans.find((p) => p.status === 'draft')
  const plan = draft || plans[0]
  return loadPlanBundle(plan)
}

async function loadPlanBundle(plan) {
  const [{ data: taskLines }, { data: sourceLines }, { data: conversions }] = await Promise.all([
    supabase.from('plan_task_lines').select('*').eq('plan_id', plan.id),
    supabase.from('plan_source_lines').select('*').eq('plan_id', plan.id),
    supabase.from('plan_sales_conversions').select('*').eq('plan_id', plan.id),
  ])
  return { plan, taskLines: taskLines || [], sourceLines: sourceLines || [], conversions: conversions || [] }
}

export async function createDraft(branchId, month, actorId, { version = 1, seed = null } = {}) {
  const { data: plan, error } = await supabase
    .from('plans')
    .insert({ branch_id: branchId, month, version, status: 'draft', created_by: actorId })
    .select()
    .single()
  if (error) throw error
  if (seed) {
    await seedLines(plan.id, seed)
  }
  await logChange(actorId, 'plans', plan.id, 'create', { month, branch_id: branchId, version })
  return loadPlanBundle(plan)
}

async function seedLines(planId, seed) {
  if (seed.taskLines?.length) {
    await supabase.from('plan_task_lines').insert(
      seed.taskLines.map((l) => ({
        plan_id: planId,
        client_task_id: l.client_task_id,
        target_revenue: l.target_revenue,
        ad_budget_pct: l.ad_budget_pct,
      }))
    )
  }
  if (seed.sourceLines?.length) {
    await supabase.from('plan_source_lines').insert(
      seed.sourceLines.map((l) => ({
        plan_id: planId,
        client_task_id: l.client_task_id,
        demand_source_id: l.demand_source_id,
        revenue_share: l.revenue_share,
        avg_check: l.avg_check,
        ad_budget: l.ad_budget,
        owner_id: l.owner_id,
      }))
    )
  }
  if (seed.conversions?.length) {
    await supabase.from('plan_sales_conversions').insert(
      seed.conversions.map((c) => ({
        plan_id: planId,
        from_stage_id: c.from_stage_id,
        to_stage_id: c.to_stage_id,
        rate: c.rate,
      }))
    )
  }
}

// Upsert one task-line input (creates or updates).
export async function saveTaskLine(planId, clientTaskId, patch) {
  const { error } = await supabase
    .from('plan_task_lines')
    .upsert({ plan_id: planId, client_task_id: clientTaskId, ...patch }, { onConflict: 'plan_id,client_task_id' })
  if (error) throw error
}

export async function saveSourceLine(planId, clientTaskId, demandSourceId, patch) {
  const { error } = await supabase
    .from('plan_source_lines')
    .upsert(
      { plan_id: planId, client_task_id: clientTaskId, demand_source_id: demandSourceId, ...patch },
      { onConflict: 'plan_id,client_task_id,demand_source_id' }
    )
  if (error) throw error
}

export async function saveConversion(planId, fromStageId, toStageId, rate) {
  const { error } = await supabase
    .from('plan_sales_conversions')
    .upsert({ plan_id: planId, from_stage_id: fromStageId, to_stage_id: toStageId, rate }, { onConflict: 'plan_id,from_stage_id,to_stage_id' })
  if (error) throw error
}

export async function savePlanFields(planId, patch, actorId) {
  const { error } = await supabase.from('plans').update(patch).eq('id', planId)
  if (error) throw error
  await logChange(actorId, 'plans', planId, 'update', patch)
}

// Approve: recompute snapshot from current inputs, mark approved.
export async function approvePlan(bundle, tasksForCalc, actorId, reason = null) {
  const computed = computeMarketing(tasksForCalc)
  const { plan } = bundle
  const { error } = await supabase
    .from('plans')
    .update({
      status: 'approved',
      computed,
      approved_by: actorId,
      approved_at: new Date().toISOString(),
      reason: plan.version > 1 ? reason : null,
    })
    .eq('id', plan.id)
  if (error) throw error
  await logChange(actorId, 'plans', plan.id, 'update', { status: 'approved', version: plan.version, reason })
}

// "Change plan" — clone the approved plan's inputs into a new draft version.
export async function createNewVersion(branchId, month, actorId) {
  const { data: plans } = await supabase
    .from('plans')
    .select('*')
    .eq('branch_id', branchId)
    .eq('month', month)
    .order('version', { ascending: false })
  const latest = plans?.[0]
  if (!latest) throw new Error('Нет утверждённого плана для новой версии')
  const bundle = await loadPlanBundle(latest)
  return createDraft(branchId, month, actorId, {
    version: latest.version + 1,
    seed: {
      taskLines: bundle.taskLines,
      sourceLines: bundle.sourceLines,
      conversions: bundle.conversions,
    },
  })
}

// Copy last month's approved plan into a fresh draft for this month.
export async function copyPreviousMonth(branchId, month, actorId) {
  const prev = new Date(month)
  prev.setMonth(prev.getMonth() - 1)
  const prevMonth = prev.toISOString().slice(0, 10)
  const { data: plans } = await supabase
    .from('plans')
    .select('*')
    .eq('branch_id', branchId)
    .eq('month', prevMonth)
    .eq('status', 'approved')
    .order('version', { ascending: false })
  if (!plans?.length) throw new Error('За прошлый месяц нет утверждённого плана')
  const bundle = await loadPlanBundle(plans[0])
  return createDraft(branchId, month, actorId, {
    version: 1,
    seed: { taskLines: bundle.taskLines, sourceLines: bundle.sourceLines, conversions: bundle.conversions },
  })
}
