import { supabase } from '../supabaseClient'
import { fetchAll } from './paging'

function monthRange(month) {
  const start = new Date(month)
  const end = new Date(start)
  end.setMonth(end.getMonth() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

// Deals whose обращение (created_at) falls in the month, for a branch and brand.
// brandId null = every brand; branchId null = every branch. Stage events are
// embedded so no long id lists travel in the URL; results are paged.
export async function loadCohort(branchId, month, brandId = null) {
  const { start, end } = monthRange(month)
  const rows = await fetchAll(() => {
    let q = supabase
      .from('deals')
      .select('*, events:deal_stage_events(id, deal_id, stage_id, entered_at)')
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: true })
    if (branchId) q = q.eq('branch_id', branchId)
    if (brandId) q = q.eq('brand_id', brandId)
    return q
  })
  const events = []
  const deals = rows.map(({ events: ev, ...d }) => {
    events.push(...(ev ?? []))
    return d
  })
  return { deals, events }
}

// Latest approved commerce plan snapshot for a branch+month (+brand), or null.
export async function loadApprovedPlan(branchId, month, brandId = null) {
  let q = supabase
    .from('plans')
    .select('id, version, computed, sales_avg_check, brand_id')
    .eq('branch_id', branchId)
    .eq('month', month)
    .eq('kind', 'commerce')
    .eq('status', 'approved')
    .order('version', { ascending: false })
    .limit(1)
  if (brandId) q = q.eq('brand_id', brandId)
  const { data, error } = await q
  if (error) throw error
  const plan = data?.[0]
  if (!plan) return null
  // Sales conversions of that plan version (planned funnel).
  const { data: conv } = await supabase.from('plan_sales_conversions').select('*').eq('plan_id', plan.id)
  return { ...plan, conversions: conv || [] }
}
