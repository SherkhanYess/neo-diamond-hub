// Edge Function: ingest deals from the CRM (amoCRM webhook, Make/n8n, a sync job).
// Auth: header `x-ingest-key` must equal the INGEST_KEY secret.
// Body: one deal object or an array of them (see Settings → Интеграции).
// Names are resolved to ids here; UTM → source/converter/ad is resolved by the
// deals trigger (resolve_utm), the same rule the whole hub uses.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()

type Incoming = Record<string, any>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  const expected = Deno.env.get('INGEST_KEY') ?? ''
  const given = req.headers.get('x-ingest-key') ?? ''
  if (!expected || !safeEqual(given, expected)) return json({ error: 'unauthorized' }, 401)

  let body: Incoming | Incoming[]
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid json' }, 400)
  }
  const items = Array.isArray(body) ? body : [body]
  if (items.length > 500) return json({ error: 'max 500 deals per request' }, 413)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Dictionaries for name → id resolution.
  const [brands, branches, stages, tasks, profiles, users] = await Promise.all([
    db.from('brands').select('id, slug, name').then((r) => r.data ?? []),
    db.from('branches').select('id, name').then((r) => r.data ?? []),
    db.from('funnel_stages').select('id, name, sort_order, crm_status_id, is_sale').then((r) => r.data ?? []),
    db.from('client_tasks').select('id, name, brand_id').then((r) => r.data ?? []),
    db.from('profiles').select('id, full_name').then((r) => r.data ?? []),
    db.auth.admin.listUsers({ perPage: 1000 }).then((r) => r.data?.users ?? []),
  ])
  const ordered = [...stages].sort((a, b) => a.sort_order - b.sort_order)
  const findBrand = (v: unknown) => brands.find((b: any) => b.id === v || norm(b.slug) === norm(v) || norm(b.name) === norm(v))
  const findBranch = (v: unknown) => branches.find((b: any) => b.id === v || norm(b.name) === norm(v))
  const findStage = (v: unknown) =>
    ordered.find((s: any) => s.id === v || norm(s.name) === norm(v) || (s.crm_status_id && String(s.crm_status_id) === String(v)))
  const findTask = (v: unknown, brandId: string) =>
    tasks.find((t: any) => t.brand_id === brandId && (t.id === v || norm(t.name) === norm(v)))
  const findPerson = (v: unknown) => {
    if (!v) return null
    const byEmail = users.find((u: any) => norm(u.email) === norm(v))
    if (byEmail) return byEmail.id
    return profiles.find((p: any) => p.id === v || norm(p.full_name) === norm(v))?.id ?? null
  }

  const results: any[] = []
  for (const it of items) {
    const warnings: string[] = []
    try {
      if (!it.crm_id) throw new Error('crm_id is required')
      const brand = findBrand(it.brand ?? 'neodiamond')
      if (!brand) throw new Error(`unknown brand: ${it.brand}`)
      const branch = it.branch ? findBranch(it.branch) : null
      if (it.branch && !branch) warnings.push(`unknown branch: ${it.branch}`)
      const stage = it.stage ? findStage(it.stage) : null
      if (it.stage && !stage) warnings.push(`unknown stage: ${it.stage}`)
      const task = it.client_task ? findTask(it.client_task, brand.id) : null
      if (it.client_task && !task) warnings.push(`unknown client_task for ${brand.slug}: ${it.client_task}`)
      const person = (k: string) => {
        if (!it[k]) return undefined
        const id = findPerson(it[k])
        if (!id) warnings.push(`unknown ${k}: ${it[k]}`)
        return id
      }

      const row: Record<string, unknown> = {
        crm_id: String(it.crm_id),
        brand_id: brand.id,
        ...(branch && { branch_id: branch.id }),
        ...(it.created_at && { created_at: it.created_at }),
        ...(stage && { current_stage_id: stage.id }),
        ...(task && { client_task_id: task.id }),
      }
      for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ad_id', 'lost_reason', 'sale_at']) {
        if (it[k] !== undefined) row[k] = it[k] === '' ? null : it[k]
      }
      for (const k of ['revenue', 'first_response_minutes']) {
        if (it[k] !== undefined) row[k] = it[k] === null || it[k] === '' ? null : Number(it[k])
      }
      for (const k of ['is_repeat', 'is_ignored']) if (it[k] !== undefined) row[k] = !!it[k]
      const lm = person('lead_manager'), cs = person('consultant'), am = person('account_manager')
      if (lm !== undefined) row.lead_manager_id = lm
      if (cs !== undefined) row.consultant_id = cs
      if (am !== undefined) row.account_manager_id = am

      const { data: existing } = await db.from('deals').select('id, created_at').eq('crm_id', row.crm_id).maybeSingle()
      let dealId: string
      if (existing) {
        const { error } = await db.from('deals').update(row).eq('id', existing.id)
        if (error) throw error
        dealId = existing.id
      } else {
        const { data, error } = await db.from('deals').insert(row).select('id').single()
        if (error) throw error
        dealId = data.id
      }

      // Stage events: explicit history, else imply every stage up to the current one.
      const events: { stage_id: string; entered_at: string }[] = []
      if (Array.isArray(it.stages)) {
        for (const h of it.stages) {
          const s = findStage(h.stage)
          if (s) events.push({ stage_id: s.id, entered_at: h.at ?? new Date().toISOString() })
          else warnings.push(`unknown stage in history: ${h.stage}`)
        }
      } else if (stage) {
        const createdAt = (it.created_at ?? existing?.created_at ?? new Date().toISOString()) as string
        const now = new Date().toISOString()
        for (const s of ordered) {
          if (s.sort_order > stage.sort_order) break
          const at = s.is_sale && it.sale_at ? it.sale_at : s.id === stage.id ? now : createdAt
          events.push({ stage_id: s.id, entered_at: at })
        }
        if (events.length) events[0].entered_at = createdAt
      }
      if (events.length) {
        const { error } = await db
          .from('deal_stage_events')
          .upsert(events.map((e) => ({ deal_id: dealId, ...e })), { onConflict: 'deal_id,stage_id', ignoreDuplicates: true })
        if (error) throw error
      }
      const { data: after } = await db.from('deals').select('demand_source_id, converter_id, ad_id').eq('id', dealId).single()
      results.push({ crm_id: row.crm_id, id: dealId, created: !existing, attribution: after, warnings })
    } catch (e) {
      results.push({ crm_id: it?.crm_id ?? null, error: (e as Error).message, warnings })
    }
  }
  const failed = results.filter((r) => r.error).length
  return json({ ok: failed === 0, received: items.length, failed, results }, failed && failed === items.length ? 400 : 200)
})
