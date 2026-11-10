// Edge Function: вебхук amoCRM «сделка изменена» → код обращения.
//
// Salesbot «Инфоцентр: первое сообщение» пишет текст первого сообщения дня в
// поле «Код обращения». amoCRM присылает сюда изменение сделки; функция:
//   1. берёт текст из поля (если там уже только код — наша же запись — выходит);
//   2. находит канал сообщения (WhatsApp / Директ) по свежим событиям чатов;
//   3. разбирает код (_shared/inquiry.js) и оставляет в поле только код;
//   4. заполняет пустые поля сделки: UTM (все пустые), «Источник лида», тег бренда;
//   5. пишет обращение в crm_inquiries — без текста сообщения.
// Источник и конвертер дальше считает amocrm-sync по UTM (resolve_utm).
//
// Auth: ?key=HOOK_KEY в адресе вебхука. Отвечаем сразу, работа — в фоне:
// amoCRM отключает вебхуки, которые отвечают медленно.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseInquiry, isCodeOnly, channelOf, attributable } from '../_shared/inquiry.js'

const FIELD = 424891
const UTM_FIELDS: Record<string, number> = {
  utm_source: 61411,
  utm_medium: 61407,
  utm_campaign: 61409,
  utm_content: 61405,
  utm_term: 61413,
}
const LEAD_SOURCE = 411029
// Вид обращения → значение «Источник лида» (ставим только в пустое поле).
const LEAD_SOURCE_ENUM: Record<string, number> = {
  site: 271935,
  site_guide: 295499,
  profile: 271937,
  direct: 271937,
  '2gis': 271941,
  ctwa: 271983,
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function amo(domain: string, token: string) {
  return async (method: string, path: string, body?: unknown) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(`https://${domain}.amocrm.ru/api/v4/${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (res.status === 429) {
        await sleep(1000 * (attempt + 1))
        continue
      }
      if (res.status === 204) return null
      if (!res.ok) throw new Error(`amoCRM ${method} ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return await res.json()
    }
    throw new Error(`amoCRM ${path}: rate limited`)
  }
}

// Сделки из тела вебхука, у которых в изменении есть поле кода с текстом.
export function leadsWithText(form: URLSearchParams) {
  const out = new Map<string, string>()
  const ids = new Map<string, string>()
  const fieldIds = new Map<string, string>()
  const values = new Map<string, string>()
  for (const [k, v] of form) {
    let m = k.match(/^leads\[(update|add)\]\[(\d+)\]\[id\]$/)
    if (m) ids.set(`${m[1]}:${m[2]}`, v)
    m = k.match(/^leads\[(update|add)\]\[(\d+)\]\[custom_fields\]\[(\d+)\]\[id\]$/)
    if (m) fieldIds.set(`${m[1]}:${m[2]}:${m[3]}`, v)
    m = k.match(/^leads\[(update|add)\]\[(\d+)\]\[custom_fields\]\[(\d+)\]\[values\]\[0\]\[value\]$/)
    if (m) values.set(`${m[1]}:${m[2]}:${m[3]}`, v)
  }
  for (const [key, fid] of fieldIds) {
    if (Number(fid) !== FIELD) continue
    const value = values.get(key) ?? ''
    const id = ids.get(key.split(':').slice(0, 2).join(':'))
    if (id && value && !isCodeOnly(value)) out.set(id, value)
  }
  return out
}

async function channelFor(call: ReturnType<typeof amo>, leadId: number) {
  const from = Math.floor(Date.now() / 1000) - 30 * 60
  const r = await call('GET', `events?filter[type]=incoming_chat_message&filter[created_at][from]=${from}&limit=100`)
  const e = (r?._embedded?.events ?? []).find((x: any) => x.entity_type === 'lead' && x.entity_id === leadId)
  return channelOf(e?.value_after?.[0]?.message?.origin)
}

const fieldOf = (lead: any, id: number) =>
  (lead.custom_fields_values || []).find((f: any) => f.field_id === id)?.values?.[0] ?? null

async function processLead(call: ReturnType<typeof amo>, db: any, leadId: number) {
  const lead = await call('GET', `leads/${leadId}`)
  if (!lead) return { leadId, skipped: 'not found' }
  const text = String(fieldOf(lead, FIELD)?.value ?? '')
  if (!text || isCodeOnly(text)) return { leadId, skipped: 'code only' }

  const channel = await channelFor(call, leadId)
  const r = parseInquiry(text, channel)

  // Бот пишет только сообщения с признаком кода. Если кода всё же нет (скобка
  // в обычном тексте) — поле очищаем и ничего не ставим: канал без кода
  // считает синхронизация инфоцентра. Выбор менеджера не перебиваем никогда.
  const isNew = attributable(r.kind)
  const managerPicked = !!fieldOf(lead, LEAD_SOURCE)
  const cf: any[] = [{ field_id: FIELD, values: isNew ? [{ value: r.code }] : null }]
  const utmEmpty = Object.values(UTM_FIELDS).every((id) => !fieldOf(lead, id)?.value)
  const writeUtm = isNew && utmEmpty && !managerPicked
  if (writeUtm) {
    for (const [k, v] of Object.entries(r.utm)) if (v) cf.push({ field_id: UTM_FIELDS[k], values: [{ value: v }] })
  }
  const srcKey = r.kind === 'site' && r.page === 'guide' ? 'site_guide' : r.kind
  if (isNew && !managerPicked && LEAD_SOURCE_ENUM[srcKey]) {
    cf.push({ field_id: LEAD_SOURCE, values: [{ enum_id: LEAD_SOURCE_ENUM[srcKey] }] })
  }
  const patch: any = { custom_fields_values: cf }
  const tags = (lead._embedded?.tags ?? []).map((t: any) => ({ id: t.id }))
  if (isNew && r.brand === 'taena' && !(lead._embedded?.tags ?? []).some((t: any) => t.name?.toLowerCase() === 'taena')) {
    patch._embedded = { tags: [...tags, { name: 'taena' }] }
  }
  await call('PATCH', `leads/${leadId}`, patch)

  const { error } = await db.from('crm_inquiries').insert({
    lead_id: leadId,
    channel,
    kind: r.kind,
    code: r.code,
    brand: r.brand,
    entry: r.entry,
    type: r.type,
    page: r.page,
    ad_id: r.adId,
    ad_short: r.adShort,
    utm: r.utm,
    is_new: isNew,
  })
  if (error) throw new Error(`crm_inquiries: ${error.message}`)
  return { leadId, kind: r.kind, code: r.code, isNew, utm: writeUtm }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const expected = Deno.env.get('HOOK_KEY') ?? ''
  if (!expected || !safeEqual(url.searchParams.get('key') ?? '', expected)) return new Response('unauthorized', { status: 401 })
  if (req.method !== 'POST') return new Response('ok')

  const raw = await req.text()
  const form = new URLSearchParams(raw)
  const leads = leadsWithText(form)
  if (!leads.size) return new Response('ok')

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const call = amo(Deno.env.get('AMO_DOMAIN') ?? 'neodiamondkz', Deno.env.get('AMO_TOKEN')!)
  const work = (async () => {
    for (const id of leads.keys()) {
      try {
        const res = await processLead(call, db, Number(id))
        console.log(JSON.stringify(res))
      } catch (e) {
        console.error(`lead ${id}: ${(e as Error).message}`)
        await db
          .from('integrations')
          .update({ last_error: `hook lead ${id}: ${(e as Error).message}`.slice(0, 500) })
          .eq('key', 'amocrm')
      }
    }
  })()
  // @ts-ignore EdgeRuntime есть в Supabase Edge Functions
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work)
  else await work
  return new Response('ok')
})
