import { supabase } from '../supabaseClient'

function monthRange(month) {
  const start = new Date(month)
  const end = new Date(start)
  end.setMonth(end.getMonth() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

// Deals whose обращение (created_at) falls in the month, for a branch.
export async function loadCohort(branchId, month) {
  const { start, end } = monthRange(month)
  const { data: deals, error } = await supabase
    .from('deals')
    .select('*')
    .eq('branch_id', branchId)
    .gte('created_at', start)
    .lt('created_at', end)
  if (error) throw error
  const ids = (deals || []).map((d) => d.id)
  let events = []
  if (ids.length) {
    const { data: ev, error: e2 } = await supabase.from('deal_stage_events').select('*').in('deal_id', ids)
    if (e2) throw e2
    events = ev || []
  }
  return { deals: deals || [], events }
}

// Latest approved plan snapshot for a branch+month, or null.
export async function loadApprovedPlan(branchId, month) {
  const { data, error } = await supabase
    .from('plans')
    .select('id, version, computed, sales_avg_check')
    .eq('branch_id', branchId)
    .eq('month', month)
    .eq('status', 'approved')
    .order('version', { ascending: false })
    .limit(1)
  if (error) throw error
  const plan = data?.[0]
  if (!plan) return null
  // Sales conversions of that plan version (planned funnel).
  const { data: conv } = await supabase.from('plan_sales_conversions').select('*').eq('plan_id', plan.id)
  return { ...plan, conversions: conv || [] }
}
