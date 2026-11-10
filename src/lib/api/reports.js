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
