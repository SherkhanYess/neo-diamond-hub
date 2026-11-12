// Edge Function: Meta Ads → hub. Read-only on the Meta side.
//
// Auth: header `x-sync-key` = SYNC_KEY (pg_cron sends it every hour).
// Body: { mode: 'incremental' }                         — last N days (config.incremental_days)
//       { mode: 'range', from, to, account? }            — backfill, one account or all
//
// Writes ad_entities (campaign → group → ad) and ad_daily_stats per ad per day.
// Spend: USD × НБ РК rate of the day (fx_rates) × (1 + vat_pct/100), in tenge.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
type Cfg = Record<string, any>

// ------------------------------------------------------------------ Meta
function meta(token: string, api: string) {
  return async function all(path: string, params: Record<string, string | number>) {
    const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), access_token: token })
    let url: string | null = `https://graph.facebook.com/${api}/${path}?${q}`
    const out: any[] = []
    while (url) {
      let res: Response | null = null
      for (let attempt = 0; attempt < 5; attempt++) {
        res = await fetch(url)
        if (res.status !== 429 && res.status < 500) break
        await sleep(2000 * (attempt + 1))
      }
      const body = await res!.json()
      if (body.error) throw new Error(`Meta ${path}: ${body.error.message}`)
      out.push(...(body.data ?? []))
      url = body.paging?.next ?? null
    }
    return out
  }
}

// ------------------------------------------------------------------ FX
async function nbkRate(day: string): Promise<number | null> {
  const [y, m, d] = day.split('-')
  const res = await fetch(`https://nationalbank.kz/rss/get_rates.cfm?fdate=${d}.${m}.${y}`)
  if (!res.ok) return null
  const xml = await res.text()
  const m2 = xml.match(/<title>USD<\/title>\s*<description>([\d.]+)<\/description>/)
  return m2 ? Number(m2[1]) : null
}

async function ratesFor(db: SupabaseClient, days: string[]) {
  const uniq = [...new Set(days)].sort()
  const { data } = await db.from('fx_rates').select('day, usd').in('day', uniq)
  const have = new Map((data ?? []).map((r: any) => [r.day, Number(r.usd)]))
  const fresh: any[] = []
  for (const day of uniq) {
    if (have.has(day)) continue
    const usd = await nbkRate(day)
    if (usd) {
      have.set(day, usd)
      fresh.push({ day, usd })
    }
  }
  if (fresh.length) await db.from('fx_rates').upsert(fresh, { onConflict: 'day' })
  // A day without a published rate takes the nearest earlier one.
  let last: number | null = null
  const { data: before } = await db.from('fx_rates').select('usd').lt('day', uniq[0]).order('day', { ascending: false }).limit(1)
  if (before?.[0]) last = Number(before[0].usd)
  const out = new Map<string, number>()
  for (const day of uniq) {
    if (have.has(day)) last = have.get(day)!
    if (last) out.set(day, last)
  }
  return out
}

// ------------------------------------------------------------------ mapping
export function brandOf(campaignName: string, account: string, cfg: Cfg) {
  const name = String(campaignName ?? '').toLowerCase()
  for (const r of cfg.brand_rules ?? []) if (name.includes(String(r.match).toLowerCase())) return r.brand
  return cfg.accounts?.[account]?.brand ?? 'neodiamond'
}

async function syncAccount(db: SupabaseClient, all: ReturnType<typeof meta>, cfg: Cfg, ctx: any, account: string, from: string, to: string) {
  const rows = await all(`${account}/insights`, {
    level: 'ad',
    time_increment: 1,
    fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks',
    time_range: JSON.stringify({ since: from, until: to }),
    limit: 500,
  })
  if (!rows.length) return { account, rows: 0 }

  const adsets = await all(`${account}/adsets`, {
    fields: 'id,destination_type',
    filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: [...new Set(rows.map((r) => r.adset_id))] }]),
    limit: 500,
  }).catch(() => [])
  const destOf = new Map(adsets.map((a: any) => [a.id, a.destination_type]))

  // Existing entities: keep hand-made mapping and ids.
  const ext = [...new Set(rows.flatMap((r) => [r.campaign_id, r.adset_id, r.ad_id]))]
  const existing = new Map<string, any>()
  for (let i = 0; i < ext.length; i += 300) {
    const { data } = await db
      .from('ad_entities')
      .select('id, external_id, brand_id, demand_source_id, converter_id, mapped_by_hand')
      .eq('cabinet', 'meta')
      .in('external_id', ext.slice(i, i + 300))
    for (const e of data ?? []) existing.set(e.external_id, e)
  }

  const mapping = (campaignName: string, dest: string | null) => {
    const brandSlug = brandOf(campaignName, account, cfg)
    const brand = ctx.brands.find((b: any) => b.slug === brandSlug) ?? ctx.brands[0]
    const source = ctx.sources.find((s: any) => s.brand_id === brand.id && s.name === cfg.source)
    const convName = dest ? cfg.destination_converter?.[dest] : null
    const conv = convName && source
      ? ctx.converters.find((c: any) => c.brand_id === brand.id && c.demand_source_id === source.id && c.name === convName && !c.is_archived)
      : null
    return { brand_id: brand.id, demand_source_id: source?.id ?? null, converter_id: conv?.id ?? null }
  }
  const keepHand = (externalId: string, m: any) => {
    const e = existing.get(externalId)
    return e?.mapped_by_hand ? { brand_id: e.brand_id, demand_source_id: e.demand_source_id, converter_id: e.converter_id } : m
  }

  const upsert = async (list: any[]) => {
    const { data, error } = await db.from('ad_entities').upsert(list, { onConflict: 'cabinet,external_id' }).select('id, external_id')
    if (error) throw new Error(`ad_entities: ${error.message}`)
    return new Map((data ?? []).map((d: any) => [d.external_id, d.id]))
  }

  // Campaigns: converter only if every group of it leads to the same place.
  const camps = new Map<string, any>()
  const groups = new Map<string, any>()
  const ads = new Map<string, any>()
  for (const r of rows) {
    const dest = destOf.get(r.adset_id) ?? null
    if (!camps.has(r.campaign_id)) camps.set(r.campaign_id, { name: r.campaign_name, dests: new Set() })
    camps.get(r.campaign_id).dests.add(dest)
    groups.set(r.adset_id, { name: r.adset_name, campaign: r.campaign_id, campaignName: r.campaign_name, dest })
    ads.set(r.ad_id, { name: r.ad_name, group: r.adset_id, campaign: r.campaign_id, campaignName: r.campaign_name, dest })
  }
  const campIds = await upsert(
    [...camps].map(([id, c]) => {
      const dest = c.dests.size === 1 ? [...c.dests][0] : null
      return { cabinet: 'meta', level: 'campaign', external_id: id, name: c.name, account_id: account, destination: dest, ...keepHand(id, mapping(c.name, dest)) }
    })
  )
  const groupIds = await upsert(
    [...groups].map(([id, g]) => ({
      cabinet: 'meta', level: 'group', external_id: id, name: g.name, parent_id: campIds.get(g.campaign), account_id: account,
      destination: g.dest, ...keepHand(id, keepHand(g.campaign, mapping(g.campaignName, g.dest))),
    }))
  )
  const adIds = await upsert(
    [...ads].map(([id, a]) => ({
      cabinet: 'meta', level: 'ad', external_id: id, name: a.name, parent_id: groupIds.get(a.group), account_id: account,
      destination: a.dest, ...keepHand(id, keepHand(a.campaign, mapping(a.campaignName, a.dest))),
    }))
  )

  const fx = await ratesFor(db, rows.map((r) => r.date_start))
  const vat = 1 + Number(cfg.vat_pct ?? 0) / 100
  const stats = rows.map((r) => {
    const usd = Number(r.spend) || 0
    const rate = fx.get(r.date_start) ?? null
    return {
      ad_entity_id: adIds.get(r.ad_id),
      day: r.date_start,
      spend_usd: usd,
      fx: rate,
      spend: rate ? Math.round(usd * rate * vat) : 0,
      impressions: Number(r.impressions) || 0,
      clicks: Number(r.clicks) || 0,
    }
  })
  for (let i = 0; i < stats.length; i += 500) {
    const { error } = await db.from('ad_daily_stats').upsert(stats.slice(i, i + 500), { onConflict: 'ad_entity_id,day' })
    if (error) throw new Error(`ad_daily_stats: ${error.message}`)
  }
  return { account, rows: rows.length, campaigns: camps.size, ads: ads.size, usd: Math.round(stats.reduce((a, s) => a + s.spend_usd, 0)) }
}

// Статусы (effective_status) и креативы — для всех сущностей кабинета, что уже
// есть в хабе. Отсутствующие в ответе Meta (удалённые/в архиве) → ARCHIVED.
const CREATIVE = 'creative.thumbnail_width(600).thumbnail_height(600){thumbnail_url,image_url,instagram_permalink_url}'
async function syncStatuses(db: SupabaseClient, all: ReturnType<typeof meta>, account: string) {
  const known: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('ad_entities')
      .select('external_id, level, name')
      .eq('cabinet', 'meta')
      .eq('account_id', account)
      .range(from, from + 999)
    if (error) throw new Error(`ad_entities: ${error.message}`)
    known.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  if (!known.length) return { account, statuses: 0 }

  const [camps, sets, ads] = await Promise.all([
    all(`${account}/campaigns`, { fields: 'id,effective_status', limit: 500 }),
    all(`${account}/adsets`, { fields: 'id,effective_status', limit: 500 }),
    all(`${account}/ads`, { fields: `id,effective_status,preview_shareable_link,${CREATIVE}`, limit: 200 }),
  ])
  const byId = new Map<string, any>()
  for (const x of [...camps, ...sets, ...ads]) byId.set(x.id, x)
  const now = new Date().toISOString()
  const list = known.map((e) => {
    const x = byId.get(e.external_id)
    const row: any = { cabinet: 'meta', external_id: e.external_id, level: e.level, name: e.name, status: x?.effective_status ?? 'ARCHIVED', status_at: now }
    if (e.level === 'ad' && x) {
      row.thumbnail_url = x.creative?.image_url ?? x.creative?.thumbnail_url ?? null
      row.permalink = x.creative?.instagram_permalink_url ?? null
      row.preview_url = x.preview_shareable_link ?? null
    }
    return row
  })
  // Upsert требует одинаковых ключей во всех строках — объявления отдельно.
  const ad = list.filter((r) => 'thumbnail_url' in r)
  const rest = list.filter((r) => !('thumbnail_url' in r))
  for (const part of [ad, rest]) {
    for (let i = 0; i < part.length; i += 500) {
      const { error } = await db.from('ad_entities').upsert(part.slice(i, i + 500), { onConflict: 'cabinet,external_id' })
      if (error) throw new Error(`ad status: ${error.message}`)
    }
  }
  return { account, statuses: list.length, active: list.filter((r) => r.status === 'ACTIVE').length }
}

// ------------------------------------------------------------------ handler
Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const expected = Deno.env.get('SYNC_KEY') ?? ''
  if (!expected || !safeEqual(req.headers.get('x-sync-key') ?? '', expected)) return json({ error: 'unauthorized' }, 401)
  const body = await req.json().catch(() => ({}))
  const mode = body.mode ?? 'incremental'

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: integ } = await db.from('integrations').select('*').eq('key', 'meta').single()
  if (!integ) return json({ error: 'meta integration row missing' }, 500)
  const cfg: Cfg = integ.config
  const all = meta(Deno.env.get('META_TOKEN')!, cfg.api ?? 'v21.0')

  // Кабинеты в часовом поясе Алматы (UTC+5): «сегодня» — по нему, а не по UTC.
  const today = new Date(Date.now() + 5 * 3600000)
  const from =
    mode === 'range' ? body.from : ymd(new Date(today.getTime() - (Number(cfg.incremental_days ?? 3) - 1) * 86400000))
  const to = mode === 'range' ? body.to ?? ymd(today) : ymd(today)
  const accounts = body.account ? [body.account] : Object.keys(cfg.accounts ?? {})

  try {
    const [brands, sources, converters] = await Promise.all([
      db.from('brands').select('id, slug').then((r) => r.data ?? []),
      db.from('demand_sources').select('id, name, brand_id').then((r) => r.data ?? []),
      db.from('converters').select('id, name, brand_id, demand_source_id, is_archived').then((r) => r.data ?? []),
    ])
    const ctx = { brands, sources, converters }
    const results = []
    for (const a of accounts) {
      const r: any = await syncAccount(db, all, cfg, ctx, a, from, to)
      if (mode !== 'range' || body.statuses) r.status = await syncStatuses(db, all, a)
      results.push(r)
    }
    const stats = { mode, from, to, results }
    await db
      .from('integrations')
      .update({ last_run_at: new Date().toISOString(), last_ok_at: new Date().toISOString(), last_error: null, last_stats: stats })
      .eq('key', 'meta')
    return json({ ok: true, ...stats })
  } catch (e) {
    const msg = (e as Error).message
    await db.from('integrations').update({ last_run_at: new Date().toISOString(), last_error: msg }).eq('key', 'meta')
    return json({ ok: false, error: msg }, 500)
  }
})
