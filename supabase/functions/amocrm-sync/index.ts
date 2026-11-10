// Edge Function: amoCRM → hub sync. Read-only on the CRM side.
//
// Auth: header `x-sync-key` = SYNC_KEY secret (pg_cron sends it every 10 min).
// Body: { mode: 'incremental' }                      — default, cron
//       { mode: 'events', from, to, page, pages }    — backfill lead history
//       { mode: 'leads',  from, to, page, pages }    — backfill leads
//
// Mapping lives in integrations.config (key 'amocrm'): pipelines, amo status →
// hub stage, custom field ids, lead source → UTM, occasion → client task,
// city → branch. UTM → demand source / converter is resolved by the deals
// trigger (resolve_utm), the same rule the whole hub uses.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { adShort } from '../_shared/inquiry.js'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()
const iso = (unix: number) => new Date(unix * 1000).toISOString()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const EVENT_TYPES = ['lead_status_changed', 'entity_responsible_changed', 'incoming_chat_message']

type Cfg = Record<string, any>
type Lead = Record<string, any>

// ------------------------------------------------------------------ amoCRM
function amoClient(domain: string, token: string) {
  return async function get(path: string, params: Record<string, string | number | (string | number)[]> = {}) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach((x) => q.append(`${k}[]`, String(x)))
      else q.append(k, String(v))
    }
    const url = `https://${domain}.amocrm.ru/api/v4/${path}?${q}`
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 429) {
        await sleep(1200 * (attempt + 1))
        continue
      }
      if (res.status === 204) return null
      if (!res.ok) throw new Error(`amoCRM ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return await res.json()
    }
    throw new Error(`amoCRM ${path}: rate limited`)
  }
}

// ------------------------------------------------------------------ helpers
function field(lead: Lead, id: number | number[]) {
  const ids = Array.isArray(id) ? id : [id]
  for (const fid of ids) {
    const f = (lead.custom_fields_values || []).find((x: any) => x.field_id === fid)
    if (f?.values?.length) return f.values[0]
  }
  return null
}
const fieldText = (lead: Lead, id: number | number[]) => {
  const v = field(lead, id)?.value
  return v == null || v === '' ? null : String(v).trim()
}
const fieldEnum = (lead: Lead, id: number) => {
  const e = field(lead, id)?.enum_id
  return e == null ? null : String(e)
}
const tagsOf = (lead: Lead) => (lead._embedded?.tags || []).map((t: any) => norm(t.name))

function eventRow(e: any) {
  const after = e.value_after?.[0] ?? {}
  const before = e.value_before?.[0] ?? {}
  return {
    id: e.id,
    lead_id: e.entity_id,
    type: e.type,
    at: iso(e.created_at),
    created_by: e.created_by || null,
    pipeline_id: after.lead_status?.pipeline_id ?? null,
    status_id: after.lead_status?.id ?? null,
    responsible_id: after.responsible_user?.id ?? null,
    prev_id: before.responsible_user?.id ?? before.lead_status?.id ?? null,
    origin: after.message?.origin ?? null,
  }
}

// Chat messages: only the first incoming one per lead is kept (its channel is all
// the hub needs), so a lead's history stays small and loads in one page.
async function firstChatOnly(db: SupabaseClient, rows: any[]) {
  const chat = rows.filter((r) => r.type === 'incoming_chat_message')
  if (!chat.length) return rows
  const earliest = new Map<number, any>()
  for (const r of chat) if (!earliest.has(r.lead_id) || r.at < earliest.get(r.lead_id).at) earliest.set(r.lead_id, r)
  const ids = [...earliest.keys()]
  const have = new Map<number, string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db
      .from('crm_lead_events')
      .select('lead_id, at')
      .eq('type', 'incoming_chat_message')
      .in('lead_id', ids.slice(i, i + 200))
    for (const d of data ?? []) have.set(d.lead_id, d.at)
  }
  const keep = [...earliest.values()].filter((r) => !have.has(r.lead_id) || r.at < have.get(r.lead_id)!)
  // A newer «first» row replaced by an earlier one: drop the old one.
  const replace = keep.filter((r) => have.has(r.lead_id)).map((r) => r.lead_id)
  if (replace.length) await db.from('crm_lead_events').delete().eq('type', 'incoming_chat_message').in('lead_id', replace)
  return [...rows.filter((r) => r.type !== 'incoming_chat_message'), ...keep]
}

async function storeEvents(db: SupabaseClient, events: any[]) {
  const rows = await firstChatOnly(db, events.filter((e) => e.entity_type === 'lead').map(eventRow))
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('crm_lead_events').upsert(rows.slice(i, i + 500), { onConflict: 'id' })
    if (error) throw new Error(`events: ${error.message}`)
  }
  return rows
}

// ------------------------------------------------------------------ context
async function loadContext(db: SupabaseClient, get: ReturnType<typeof amoClient>, cfg: Cfg) {
  const [brands, branches, stages, tasks, sources, authUsers, amoUsers, profiles, amoFields, ads] = await Promise.all([
    db.from('brands').select('id, slug').then((r) => r.data ?? []),
    db.from('branches').select('id, name').then((r) => r.data ?? []),
    db.from('funnel_stages').select('id, name, sort_order, is_sale').then((r) => r.data ?? []),
    db.from('client_tasks').select('id, name, brand_id').then((r) => r.data ?? []),
    db.from('demand_sources').select('id, name, brand_id').then((r) => r.data ?? []),
    db.auth.admin.listUsers({ perPage: 1000 }).then((r) => r.data?.users ?? []),
    get('users', { limit: 250 }).then((r) => r?._embedded?.users ?? []),
    db.from('profiles').select('id, full_name').then((r) => r.data ?? []),
    (async () => {
      const out: any[] = []
      for (let page = 1; page < 10; page++) {
        const r = await get('leads/custom_fields', { limit: 250, page })
        out.push(...(r?._embedded?.custom_fields ?? []))
        if (!r?._links?.next) break
      }
      return out
    })(),
    // Meta ads: brand by ad account; the site code carries a 5-char short id.
    (async () => {
      const out: any[] = []
      for (let from = 0; from < 50000; from += 1000) {
        const { data } = await db.from('ad_entities').select('external_id, brand_id').eq('level', 'ad').range(from, from + 999)
        out.push(...(data ?? []))
        if (!data || data.length < 1000) break
      }
      return out
    })(),
  ])
  const adBrand = new Map(ads.map((a: any) => [a.external_id, a.brand_id]))
  const adByShort = new Map<string, string>()
  for (const a of ads) {
    const k = adShort(a.external_id)
    if (k) adByShort.set(k, adByShort.has(k) && adByShort.get(k) !== a.external_id ? '' : a.external_id)
  }
  // Optional explicit fields, found by name: «Лид-менеджер», «Консультант», «Бренд».
  const fieldNamed = (...names: string[]) => amoFields.find((f: any) => names.includes(norm(f.name)))?.id ?? null
  const named = {
    lead_manager: fieldNamed('лид-менеджер', 'лид менеджер'),
    consultant: fieldNamed('консультант'),
    brand: fieldNamed('бренд'),
  }
  // A person picked in a list field: hub name, amoCRM user name or email.
  const profileByName = new Map<string, string>()
  for (const p of profiles) if (p.full_name) profileByName.set(norm(p.full_name), p.id)
  const profileByEmail = new Map(authUsers.map((u: any) => [norm(u.email), u.id]))
  const profileOfAmo = new Map<number, string>()
  for (const u of amoUsers) {
    const id = profileByEmail.get(norm(u.email))
    if (id) profileOfAmo.set(u.id, id)
  }
  for (const [amoId, email] of Object.entries(cfg.user_alias || {})) {
    const id = profileByEmail.get(norm(email))
    if (id) profileOfAmo.set(Number(amoId), id)
  }
  for (const u of amoUsers) {
    const id = profileOfAmo.get(u.id)
    if (id) {
      profileByName.set(norm(u.name), id)
      profileByName.set(norm(u.email), id)
    }
  }
  const stageByName = new Map(stages.map((s: any) => [s.name, s]))
  const defaultBrand = brands.find((b: any) => b.slug === 'neodiamond') ?? brands[0]
  return { brands, branches, stages, tasks, sources, profileOfAmo, profileByName, named, stageByName, defaultBrand, adBrand, adByShort }
}
type Ctx = Awaited<ReturnType<typeof loadContext>>

// ------------------------------------------------------------------ mapping
// Stage timeline from the lead's status history: every hub stage up to the
// furthest one reached, with the time it was first reached and who moved it.
export function timeline(lead: Lead, evs: any[], cfg: Cfg, ctx: Ctx) {
  const stageOf = (p: unknown, s: unknown) => {
    const name = cfg.status_stage?.[String(p)]?.[String(s)]
    return name ? ctx.stageByName.get(name) ?? null : null
  }
  const core = [...ctx.stages]
    .filter((s: any) => Object.values(cfg.status_stage || {}).some((m: any) => Object.values(m).includes(s.name)))
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
  const first = new Map<string, { at: string; by: number | null }>()
  const reach = (st: any, at: string, by: number | null) => {
    for (const s of core) {
      if (s.sort_order > st.sort_order) break
      if (!first.has(s.id)) first.set(s.id, { at, by: s.id === st.id ? by : null })
    }
  }
  const created = iso(lead.created_at)
  if (core[0]) reach(core[0], created, null)
  const moves = evs.filter((e) => e.type === 'lead_status_changed').sort((a, b) => a.at.localeCompare(b.at))
  for (const e of moves) {
    const st = stageOf(e.pipeline_id, e.status_id)
    if (st) reach(st, e.at, e.created_by)
  }
  const cur = stageOf(lead.pipeline_id, lead.status_id)
  if (cur) reach(cur, moves.length ? moves[moves.length - 1].at : created, null)

  const sale = core.find((s: any) => s.is_sale)
  const won = lead.status_id === 142 || (cur && sale && cur.id === sale.id)
  if (!won && sale) first.delete(sale.id)

  // Responsible at a moment: last change before it, else the one before the first change.
  const resp = evs.filter((e) => e.type === 'entity_responsible_changed').sort((a, b) => a.at.localeCompare(b.at))
  const responsibleAt = (at: string) => {
    let who = resp.length ? resp[0].prev_id : lead.responsible_user_id
    for (const e of resp) if (e.at <= at) who = e.responsible_id
    return who ?? lead.responsible_user_id
  }
  const furthest = core.filter((s: any) => first.has(s.id)).pop()
  return { first, core, sale, won, furthest, responsibleAt }
}

export function mapLead(lead: Lead, evs: any[], cfg: Cfg, ctx: Ctx) {
  const F = cfg.fields
  const tags = tagsOf(lead)
  const brandText = ctx.named.brand ? norm(fieldText(lead, ctx.named.brand)) : ''
  const brandSlug = Object.entries(cfg.brand_tags || {}).find(([t]) => tags.includes(norm(t)))?.[1]
  // Ad id: Meta field, else utm_term (full id or the site code's 5-char short id).
  const metaAd = fieldText(lead, F.meta_ad_id)
  const term = fieldText(lead, F.utm_term)
  const adId =
    (metaAd && /^\d{6,}$/.test(metaAd) ? metaAd : null) ??
    (term && /^\d{6,}$/.test(term) ? term : null) ??
    (term && /^[0-9a-z]{5}$/.test(term) ? ctx.adByShort.get(term) || null : null)
  const adBrandId = adId ? ctx.adBrand.get(adId) : null
  const brand =
    (brandText && ctx.brands.find((b: any) => norm(b.slug) === brandText || norm(b.name) === brandText)) ||
    (brandSlug && ctx.brands.find((b: any) => b.slug === brandSlug)) ||
    (adBrandId && ctx.brands.find((b: any) => b.id === adBrandId)) ||
    ctx.defaultBrand
  const pipe = cfg.pipelines[String(lead.pipeline_id)]
  const isRepeat = !!pipe?.repeat || tags.some((t: string) => (cfg.repeat_tags || []).includes(t))

  // UTM: real tracking fields first, else the manager-chosen lead source, else Meta ad id.
  const utm: Record<string, string | null> = {
    utm_source: fieldText(lead, F.utm_source),
    utm_medium: fieldText(lead, F.utm_medium),
    utm_campaign: fieldText(lead, F.utm_campaign),
    utm_content: fieldText(lead, F.utm_content),
    utm_term: fieldText(lead, F.utm_term),
  }
  const srcEnum = fieldEnum(lead, F.lead_source)
  if (!utm.utm_source && !utm.utm_medium) {
    const m = srcEnum ? cfg.lead_source_utm?.[srcEnum] : null
    if (m) Object.assign(utm, m)
    else if (adId) Object.assign(utm, { utm_source: 'instagram', utm_medium: 'ctwa' })
    else {
      // Ни кода, ни источника: канал первого входящего сообщения сделки.
      // Директ → «Профиль», WhatsApp → «Без источника / WhatsApp». В amoCRM не пишем.
      const first = evs
        .filter((e: any) => e.type === 'incoming_chat_message' && e.origin)
        .sort((a: any, b: any) => (a.at < b.at ? -1 : 1))[0]
      if (first) Object.assign(utm, String(first.origin).startsWith('instagram')
        ? { utm_source: 'instagram', utm_medium: 'direct' }
        : { utm_source: 'none', utm_medium: 'whatsapp' })
    }
  }
  // Источник, который выбирает менеджер (рефералка / сарафанное радио → «Рекомендации»):
  // конвертер при этом считается по коду, а источник им не перебивается.
  const referral = tags.some((t: string) => (cfg.referral_tags || []).some((r: string) => t.includes(norm(r))))
  const directName = (srcEnum ? cfg.lead_source_direct?.[srcEnum] : null) ?? (referral ? 'Рекомендации' : null)
  const direct = directName
    ? ctx.sources.find((s: any) => s.brand_id === brand.id && norm(s.name) === norm(directName))
    : null

  const taskName = cfg.occasion_task?.[fieldEnum(lead, F.occasion) ?? '']
  const task = taskName ? ctx.tasks.find((t: any) => t.brand_id === brand.id && norm(t.name) === norm(taskName)) : null
  const branchName = cfg.city_branch?.[fieldEnum(lead, F.city) ?? '']
  const branch = branchName ? ctx.branches.find((b: any) => norm(b.name) === norm(branchName)) : null

  const tl = timeline(lead, evs, cfg, ctx)
  const person = (amoId: number | null | undefined) => (amoId ? ctx.profileOfAmo.get(Number(amoId)) ?? null : null)
  const stage = (name: string) => ctx.stageByName.get(name)
  const step = (name: string) => {
    const s = stage(name)
    return s ? tl.first.get(s.id) : undefined
  }
  const set = step('Встреча назначена')
  const held = step('Встреча состоялась')
  const sold = tl.sale ? tl.first.get(tl.sale.id) : undefined

  // Explicit «Лид-менеджер» / «Консультант» fields win. Otherwise: lead centre =
  // whoever set the meeting; consultant = whoever held it / closed the sale.
  const picked = (fid: number | null) => {
    const v = fid ? fieldText(lead, fid) : null
    return v ? ctx.profileByName.get(norm(v)) ?? null : null
  }
  const leadManager =
    picked(ctx.named.lead_manager) ??
    (set ? person(set.by) ?? person(tl.responsibleAt(set.at)) : person(lead.responsible_user_id))
  const consultant =
    picked(ctx.named.consultant) ??
    (held || sold
      ? person(sold?.by) ?? person(held?.by) ?? person(tl.responsibleAt((held ?? sold)!.at)) ?? person(lead.responsible_user_id)
      : null)

  const deal = {
    crm_id: String(lead.id),
    brand_id: brand.id,
    branch_id: branch?.id ?? null,
    client_task_id: task?.id ?? null,
    demand_source_id: direct?.id ?? null,
    demand_source_fixed: !!direct,
    converter_id: null,
    ...utm,
    ad_id: adId,
    created_at: iso(lead.created_at),
    current_stage_id: tl.furthest?.id ?? null,
    revenue: tl.won ? Number(lead.price) || 0 : null,
    sale_at: tl.won && sold ? sold.at : null,
    lost_reason: lead.status_id === 143 ? lead._embedded?.loss_reason?.[0]?.name ?? 'Закрыто и не реализовано' : null,
    is_ignored: tags.some((t: string) => (cfg.ignore_tags || []).includes(t)),
    is_repeat: isRepeat,
    lead_manager_id: isRepeat ? null : leadManager,
    consultant_id: consultant,
    manager_id: consultant ?? leadManager,
    account_manager_id: isRepeat ? person(lead.responsible_user_id) : null,
    crm_pipeline_id: lead.pipeline_id,
    crm_status_id: lead.status_id,
    crm_responsible_id: lead.responsible_user_id,
    crm_updated_at: iso(lead.updated_at),
  }
  const events = [...tl.first.entries()].map(([stage_id, v]) => ({ stage_id, entered_at: v.at }))
  return { deal, events }
}

// ------------------------------------------------------------------ write
async function processLeads(db: SupabaseClient, leads: Lead[], cfg: Cfg, ctx: Ctx) {
  const since = cfg.since ? Date.parse(cfg.since) / 1000 : 0
  const tracked = leads.filter((l) => cfg.pipelines[String(l.pipeline_id)] && l.created_at >= since && !l.is_deleted)
  if (!tracked.length) return { processed: 0, skipped: leads.length }

  const ids = tracked.map((l) => l.id)
  const evs: any[] = []
  // Paged: PostgREST returns at most 1000 rows per request.
  for (let i = 0; i < ids.length; i += 100) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from('crm_lead_events')
        .select('*')
        .in('lead_id', ids.slice(i, i + 100))
        .order('id')
        .range(from, from + 999)
      if (error) throw new Error(`load events: ${error.message}`)
      evs.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
  }
  const byLead = new Map<number, any[]>()
  for (const e of evs) {
    if (!byLead.has(e.lead_id)) byLead.set(e.lead_id, [])
    byLead.get(e.lead_id)!.push(e)
  }

  const mapped = tracked.map((l) => mapLead(l, byLead.get(l.id) ?? [], cfg, ctx))
  const { data: saved, error } = await db
    .from('deals')
    .upsert(mapped.map((m) => m.deal), { onConflict: 'crm_id' })
    .select('id, crm_id')
  if (error) throw new Error(`deals: ${error.message}`)
  const idOf = new Map((saved ?? []).map((d: any) => [d.crm_id, d.id]))

  const dealIds = [...idOf.values()]
  for (let i = 0; i < dealIds.length; i += 200) {
    const { error: delErr } = await db.from('deal_stage_events').delete().in('deal_id', dealIds.slice(i, i + 200))
    if (delErr) throw new Error(`stage events delete: ${delErr.message}`)
  }
  const rows = mapped.flatMap((m) => m.events.map((e) => ({ deal_id: idOf.get(m.deal.crm_id), ...e })))
  for (let i = 0; i < rows.length; i += 1000) {
    const { error: insErr } = await db.from('deal_stage_events').insert(rows.slice(i, i + 1000))
    if (insErr) throw new Error(`stage events: ${insErr.message}`)
  }
  return { processed: tracked.length, skipped: leads.length - tracked.length }
}

async function fetchLeadsByIds(get: ReturnType<typeof amoClient>, ids: number[]) {
  const out: Lead[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const r = await get('leads', { 'filter[id]': ids.slice(i, i + 50), with: 'loss_reason', limit: 250 })
    out.push(...(r?._embedded?.leads ?? []))
  }
  return out
}

// ------------------------------------------------------------------ handler
Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const expected = Deno.env.get('SYNC_KEY') ?? ''
  if (!expected || !safeEqual(req.headers.get('x-sync-key') ?? '', expected)) return json({ error: 'unauthorized' }, 401)
  const body = await req.json().catch(() => ({}))
  const mode = body.mode ?? 'incremental'

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: integ } = await db.from('integrations').select('*').eq('key', 'amocrm').single()
  if (!integ) return json({ error: 'amocrm integration row missing' }, 500)
  const cfg: Cfg = integ.config
  const get = amoClient(cfg.domain, Deno.env.get('AMO_TOKEN')!)
  const started = Math.floor(Date.now() / 1000)
  const stats: Record<string, unknown> = { mode }

  try {
    if (mode === 'events' || mode === 'leads') {
      const from = Math.floor(Date.parse(body.from ?? cfg.since) / 1000)
      const to = body.to ? Math.floor(Date.parse(body.to) / 1000) : started
      const page0 = Number(body.page ?? 1)
      const pages = Number(body.pages ?? 5)
      let page = page0
      let done = false
      let count = 0
      const ctx = mode === 'leads' ? await loadContext(db, get, cfg) : null
      for (; page < page0 + pages; page++) {
        const r =
          mode === 'events'
            ? await get('events', {
                'filter[type]': Array.isArray(body.types) && body.types.length ? body.types : EVENT_TYPES,
                'filter[entity]': ['lead'],
                'filter[created_at][from]': from,
                'filter[created_at][to]': to,
                limit: 100,
                page,
              })
            : await get('leads', {
                'filter[created_at][from]': from,
                'filter[created_at][to]': to,
                'order[id]': 'asc',
                with: 'loss_reason',
                limit: 250,
                page,
              })
        const items = r?._embedded?.[mode] ?? []
        count += items.length
        if (mode === 'events') await storeEvents(db, items)
        else await processLeads(db, items, cfg, ctx!)
        if (!r?._links?.next) {
          done = true
          break
        }
      }
      return json({ ok: true, mode, count, next_page: done ? null : page })
    }

    // Incremental: history and leads changed since the cursor (with overlap).
    const cursor = Number(integ.state?.cursor ?? started - 86400) - 600
    const changed = new Set<number>()
    let evCount = 0
    for (let page = 1; page < 200; page++) {
      const r = await get('events', {
        'filter[type]': EVENT_TYPES,
        'filter[entity]': ['lead'],
        'filter[created_at][from]': cursor,
        limit: 100,
        page,
      })
      const items = r?._embedded?.events ?? []
      evCount += items.length
      for (const row of await storeEvents(db, items)) changed.add(row.lead_id)
      if (!r?._links?.next) break
    }
    const leads = new Map<number, Lead>()
    for (let page = 1; page < 200; page++) {
      const r = await get('leads', { 'filter[updated_at][from]': cursor, with: 'loss_reason', limit: 250, page })
      for (const l of r?._embedded?.leads ?? []) leads.set(l.id, l)
      if (!r?._links?.next) break
    }
    const missing = [...changed].filter((id) => !leads.has(id))
    for (const l of await fetchLeadsByIds(get, missing)) leads.set(l.id, l)

    const ctx = await loadContext(db, get, cfg)
    const res = await processLeads(db, [...leads.values()], cfg, ctx)
    Object.assign(stats, { events: evCount, leads: leads.size, ...res })
    await db
      .from('integrations')
      .update({
        state: { ...integ.state, cursor: started },
        last_run_at: new Date().toISOString(),
        last_ok_at: new Date().toISOString(),
        last_error: null,
        last_stats: stats,
      })
      .eq('key', 'amocrm')
    return json({ ok: true, ...stats })
  } catch (e) {
    const msg = (e as Error).message
    await db.from('integrations').update({ last_run_at: new Date().toISOString(), last_error: msg }).eq('key', 'amocrm')
    return json({ ok: false, error: msg, ...stats }, 500)
  }
})
