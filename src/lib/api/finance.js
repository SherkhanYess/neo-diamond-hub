// Финансы: загрузка копии Adesk и справочников фондов, запись привязок.
// Доступ ограничен правом `finance` (RLS).
import { supabase } from '../supabaseClient'
import { fetchAll } from './paging'
import { prepareRules } from '../finance/classify'
import { openingFor, monthStart, nextMonth } from '../finance/opening'
import { copyModel } from '../finance/model'

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

/** Фонды, строки, правила, люди, счета, статьи — всё для разнесения и настроек. */
export async function loadFinanceRefs() {
  const [funds, items, rules, people, accounts, categories, integ] = await Promise.all([
    supabase.from('fin_funds').select('*').order('sort').then(must),
    supabase.from('fin_items').select('*').order('sort').then(must),
    supabase.from('fin_rules').select('*').order('priority').then(must),
    supabase.from('fin_people').select('*').order('sort').then(must),
    supabase.from('adesk_accounts').select('*').order('name').then(must),
    supabase.from('adesk_categories').select('*').order('name').then(must),
    supabase.from('integrations').select('config, last_ok_at, last_error').eq('key', 'adesk').maybeSingle().then(must),
  ])
  const special = integ?.config?.special
  return {
    raw: { funds, items, rules, people, accounts, categories },
    R: prepareRules({ funds, items, rules, people, accounts, ...(special ? { special } : {}) }),
    config: integ?.config ?? {},
    lastOk: integ?.last_ok_at ?? null,
    lastError: integ?.last_error ?? null,
  }
}

/** Операции месяца с типом и названием сделки. */
export async function loadMonthTxs(month) {
  const from = monthStart(month)
  const to = monthStart(nextMonth(month))
  const rows = await fetchAll(() =>
    supabase
      .from('adesk_transactions')
      .select('id, date, related_date, type, amount, amount_kzt, account_id, category_id, project_id, is_transfer, description, contractor')
      .gte('date', from)
      .lt('date', to)
      .order('date')
      .order('id')
  )
  // Сделки — отдельным запросом: внешнего ключа нет (сделка может прийти позже операции).
  const ids = [...new Set(rows.map((r) => r.project_id).filter(Boolean))]
  const projects = new Map()
  for (let i = 0; i < ids.length; i += 300) {
    const part = must(await supabase.from('adesk_projects').select('id, type, name').in('id', ids.slice(i, i + 300)))
    for (const p of part) projects.set(Number(p.id), p)
  }
  return rows.map((t) => {
    const p = projects.get(Number(t.project_id))
    return { ...t, project_type: p?.type ?? null, project_name: p?.name ?? null }
  })
}

/** Остаток на начало месяца от опорной точки из отчёта Adesk. */
export async function loadOpening(month, config) {
  const anchor = config?.opening_anchor
  if (!anchor) return 0
  return openingFor(month, anchor, async (from, to) => must(await supabase.rpc('fin_flow', { p_from: from, p_to: to })))
}

/** Операций по статьям за последние 60 дней — для экрана привязки. */
export async function loadCategoryUsage() {
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
  const rows = await fetchAll(() => supabase.from('adesk_transactions').select('category_id, type').gte('date', since))
  const out = new Map()
  for (const r of rows) if (r.category_id != null) out.set(Number(r.category_id), (out.get(Number(r.category_id)) ?? 0) + 1)
  return out
}

/** Привязать статью Adesk к строке фонда (itemId null — отвязать). */
export async function saveCategoryRule(categoryId, itemId) {
  must(await supabase.from('fin_rules').delete().eq('kind', 'category').eq('category_id', categoryId))
  if (itemId) must(await supabase.from('fin_rules').insert({ kind: 'category', priority: 50, category_id: categoryId, item_id: itemId }))
}

export async function saveRule(rule) {
  if (rule.id) return must(await supabase.from('fin_rules').update(rule).eq('id', rule.id).select().single())
  return must(await supabase.from('fin_rules').insert(rule).select().single())
}
export async function deleteRule(id) {
  must(await supabase.from('fin_rules').delete().eq('id', id))
}

export async function savePerson(person) {
  if (person.id) return must(await supabase.from('fin_people').update(person).eq('id', person.id).select().single())
  return must(await supabase.from('fin_people').insert(person).select().single())
}
export async function deletePerson(id) {
  must(await supabase.from('fin_people').delete().eq('id', id))
}

export async function saveAccountKind(id, kind) {
  must(await supabase.from('adesk_accounts').update({ kind, kind_by_hand: true }).eq('id', id))
}

/** Строка фонда: добавить / переименовать. */
export async function saveItem(item) {
  if (item.id) return must(await supabase.from('fin_items').update(item).eq('id', item.id).select().single())
  return must(await supabase.from('fin_items').insert(item).select().single())
}

// ------------------------------------------------------------------ Финмодель

const monthDate = (month) => `${month}-01`

/** Модель месяца. Нет — создаётся копией последней модели до него (старые не меняются). */
export async function loadModel(month) {
  const have = must(await supabase.from('fin_models').select('*').eq('month', monthDate(month)).maybeSingle())
  if (have) return have
  let prev = must(await supabase.from('fin_models').select('*').lt('month', monthDate(month)).order('month', { ascending: false }).limit(1).maybeSingle())
  if (!prev) prev = must(await supabase.from('fin_models').select('*').order('month').limit(1).maybeSingle())
  if (!prev) return null
  const fresh = copyModel(prev, monthDate(month))
  return must(await supabase.from('fin_models').upsert(fresh, { onConflict: 'month' }).select().single())
}

export async function saveModel(month, patch, actorId = null) {
  return must(
    await supabase
      .from('fin_models')
      .update({ ...patch, updated_at: new Date().toISOString(), updated_by: actorId })
      .eq('month', monthDate(month))
      .select()
      .single()
  )
}

/** План выручки из «Планирования»: утверждённые коммерческие планы месяца (последняя версия). */
export async function loadPlanningRevenue(month) {
  const { data, error } = await supabase
    .from('plans')
    .select('brand_id, branch_id, version, computed')
    .eq('kind', 'commerce')
    .eq('status', 'approved')
    .eq('month', monthDate(month))
  if (error || !data?.length) return null
  const latest = new Map()
  for (const p of data) {
    const k = `${p.brand_id}|${p.branch_id}`
    if (!latest.has(k) || latest.get(k).version < p.version) latest.set(k, p)
  }
  return [...latest.values()].reduce((a, p) => a + (Number(p.computed?.grandTotal?.revenue) || 0), 0)
}

/** Сделки Adesk и закрытые сделки amoCRM около месяца — для подсчёта продаж. */
export async function loadSalesRefs(month) {
  const projects = await fetchAll(() => supabase.from('adesk_projects').select('id, type, name, act_date, deal_amount, created'))
  const from = new Date(`${month}-01T00:00:00Z`)
  const lo = new Date(from.getTime() - 15 * 86400000).toISOString().slice(0, 10)
  const hi = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 15)).toISOString().slice(0, 10)
  let amo = []
  try {
    amo = await fetchAll(() =>
      supabase.from('deals').select('sale_at, revenue').gte('sale_at', lo).lte('sale_at', hi).not('revenue', 'is', null).eq('is_ignored', false)
    )
  } catch {
    amo = [] // без права на отчёты сверка с amoCRM просто не показывается
  }
  return { projects, amo: amo.map((d) => ({ sale_at: String(d.sale_at).slice(0, 10), revenue: Number(d.revenue) })) }
}
