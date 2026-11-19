// Edge Function: Adesk → хаб. Только чтение Adesk.
//
// Auth: заголовок x-sync-key = SYNC_KEY (pg_cron шлёт каждые 15 минут).
// Тело: { mode: 'incremental' }            — справочники + операции за config.window_days назад … +31 день
//       { mode: 'range', from, to }         — догрузка операций за период (YYYY-MM-DD)
//
// Пишет adesk_accounts, adesk_categories, adesk_projects, adesk_transactions.
// Операции окна, которых больше нет в Adesk (удалены), удаляются и у нас.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { txRow, projectRow, accountKind } from '../_shared/adesk.js'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ymd = (d: Date) => d.toISOString().slice(0, 10)

function adesk(token: string) {
  return async (path: string, params: Record<string, string | number> = {}) => {
    const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), api_token: token })
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`https://api.adesk.ru/v1/${path}?${q}`)
      if (res.status === 429 || res.status >= 500) {
        await sleep(1500 * (attempt + 1))
        continue
      }
      const body = await res.json()
      if (!body.success) throw new Error(`Adesk ${path}: ${body.message ?? res.status}`)
      return body
    }
    throw new Error(`Adesk ${path}: недоступен`)
  }
}

/** Месяцы периода: Adesk отдаёт до 1000 операций за запрос, месяц — около 400. */
function months(from: string, to: string) {
  const out: [string, string][] = []
  let d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`)
  while (ymd(d) <= to) {
    const start = ymd(d) < from ? from : ymd(d)
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    const endOfMonth = ymd(new Date(next.getTime() - 86400000))
    out.push([start, endOfMonth > to ? to : endOfMonth])
    d = next
  }
  return out
}

async function upsert(db: SupabaseClient, table: string, rows: any[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict: 'id' })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

async function syncRefs(db: SupabaseClient, call: ReturnType<typeof adesk>) {
  const now = new Date().toISOString()
  const acc = (await call('bank-accounts')).bankAccounts ?? []
  const { data: hand } = await db.from('adesk_accounts').select('id').eq('kind_by_hand', true)
  const byHand = new Set((hand ?? []).map((r: any) => Number(r.id)))
  await upsert(db, 'adesk_accounts', acc.map((a: any) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    ...(byHand.has(a.id) ? {} : { kind: accountKind(a.name) }),
    amount: Number(a.amount),
    rate: a.currency === 'KZT' ? 1 : (a.amount && a.convertedAmount ? Number(a.convertedAmount) / Number(a.amount) : null),
    status: a.status,
    synced_at: now,
  })))
  const cats = (await call('transactions/categories')).categories ?? []
  await upsert(db, 'adesk_categories', cats.map((c: any) => ({
    id: c.id, name: c.name, type: c.type, group_name: c.group?.name ?? null, archived: !!c.isArchived, synced_at: now,
  })))
  const projects: any[] = []
  for (let start = 0; ; start += 1000) {
    const page = (await call('projects', { length: 1000, start })).projects ?? []
    projects.push(...page)
    if (page.length < 1000) break
  }
  await upsert(db, 'adesk_projects', projects.map((p: any) => ({ ...projectRow(p), synced_at: now })))
  return { accounts: acc.length, categories: cats.length, projects: projects.length }
}

async function syncTx(db: SupabaseClient, call: ReturnType<typeof adesk>, from: string, to: string) {
  let total = 0
  let removed = 0
  for (const [a, b] of months(from, to)) {
    const body = await call('transactions', { range: 'custom', range_start: a, range_end: b, length: 1000 })
    const list = (body.transactions ?? []).filter((t: any) => !t.isPlanned)
    if ((body.recordsFiltered ?? 0) > 1000) throw new Error(`Adesk: за ${a}…${b} больше 1000 операций — нужна разбивка`)
    const now = new Date().toISOString()
    await upsert(db, 'adesk_transactions', list.map((t: any) => ({ ...txRow(t), raw: t, synced_at: now })))
    const ids = new Set(list.map((t: any) => t.id))
    const { data: have } = await db.from('adesk_transactions').select('id').gte('date', a).lte('date', b)
    const gone = (have ?? []).map((r: any) => Number(r.id)).filter((id: number) => !ids.has(id))
    if (gone.length) {
      await db.from('adesk_transactions').delete().in('id', gone)
      removed += gone.length
    }
    total += list.length
  }
  return { transactions: total, removed }
}

Deno.serve(async (req) => {
  const expected = Deno.env.get('SYNC_KEY') ?? ''
  if (!expected || !safeEqual(req.headers.get('x-sync-key') ?? '', expected)) return json({ ok: false, error: 'unauthorized' }, 401)
  const body = await req.json().catch(() => ({}))
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: integ } = await db.from('integrations').select('config').eq('key', 'adesk').single()
  const cfg = integ?.config ?? {}
  const call = adesk(Deno.env.get('ADESK_TOKEN') ?? '')
  const startedAt = new Date().toISOString()
  try {
    const refs = await syncRefs(db, call)
    let from: string, to: string
    if (body.mode === 'range') {
      from = body.from
      to = body.to
    } else {
      const now = new Date()
      from = ymd(new Date(now.getTime() - (cfg.window_days ?? 60) * 86400000))
      if (cfg.since && from < cfg.since) from = cfg.since
      to = ymd(new Date(now.getTime() + 31 * 86400000))
    }
    const tx = await syncTx(db, call, from, to)
    const stats = { ...refs, ...tx, from, to }
    await db.from('integrations').update({ last_run_at: startedAt, last_ok_at: new Date().toISOString(), last_error: null, last_stats: stats }).eq('key', 'adesk')
    return json({ ok: true, ...stats })
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500)
    await db.from('integrations').update({ last_run_at: startedAt, last_error: msg }).eq('key', 'adesk')
    return json({ ok: false, error: msg }, 500)
  }
})
