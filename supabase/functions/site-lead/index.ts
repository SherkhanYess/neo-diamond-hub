// Edge Function: заявка с сайта без WhatsApp (намёк taena) → сделка amoCRM.
//
// Сайт (Netlify-функция hint) шлёт POST с заголовком x-site-key (секрет SITE_LEAD_KEY).
// Функция:
//   1. проверяет тело (_shared/siteLead.js), код разбирает тем же parseInquiry, что WhatsApp;
//   2. повтор с тем же hint_id — возвращает уже созданную сделку (site_leads);
//   3. ищет контакт по телефону; нашёлся — только привязывает, ничего в нём не меняет;
//      нет — создаёт (имя + телефон);
//   4. создаёт сделку в «Первичной продаже»: код, UTM, «Источник лида», город, повод, тег taena;
//   5. добавляет примечание для менеджера и пишет crm_inquiries (как вебхук WhatsApp).
// Вебхук amocrm-hook такую сделку пропускает: в поле кода уже только код.
// Источник и конвертер дальше считает amocrm-sync по UTM, как у всех сделок.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validate, leadPayload, contactPayload, leadNote, samePhone } from '../_shared/siteLead.js'

const PIPELINE = 9907362 // Первичная продажа; этап — первый после «Неразобранного»
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-site-key',
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function amo(domain: string, token: string) {
  return async (method: string, path: string, body?: unknown) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`https://${domain}.amocrm.ru/api/v4/${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (res.status === 429) {
        await sleep(700 * (attempt + 1))
        continue
      }
      if (res.status === 204) return null
      if (!res.ok) throw new Error(`amoCRM ${method} ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return await res.json()
    }
    throw new Error(`amoCRM ${path}: rate limited`)
  }
}

async function findContact(call: ReturnType<typeof amo>, phone: string) {
  const r = await call('GET', `contacts?query=${phone.slice(-10)}&limit=25`)
  const list = r?._embedded?.contacts ?? []
  const hit = list.find((c: any) =>
    (c.custom_fields_values ?? []).some((f: any) => f.field_code === 'PHONE' && (f.values ?? []).some((v: any) => samePhone(v.value, phone)))
  )
  return hit?.id ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405)
  const expected = Deno.env.get('SITE_LEAD_KEY') ?? ''
  if (!expected || !safeEqual(req.headers.get('x-site-key') ?? '', expected)) return json({ ok: false, error: 'unauthorized' }, 401)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'bad json' }, 400)
  }
  const v = validate(body)
  if (!v.ok) return json(v, 400)
  const lead = v.lead
  const source = 'taena'

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Бронируем external_id до записи в amoCRM: два параллельных запроса не создадут две сделки.
  const { error: claimErr } = await db
    .from('site_leads')
    .insert({ source, external_id: lead.externalId, type: lead.type, code: lead.parsed.code })
  if (claimErr) {
    if (claimErr.code !== '23505') return json({ ok: false, error: `db: ${claimErr.message}` }, 500)
    // Повтор того же намёка (сайт переотправил после таймаута).
    const { data: prev } = await db
      .from('site_leads')
      .select('lead_id, contact_id, error, created_at')
      .eq('source', source)
      .eq('external_id', lead.externalId)
      .single()
    if (prev?.lead_id) return json({ ok: true, lead_id: prev.lead_id, contact_id: prev.contact_id, duplicate: true })
    const stale = Date.now() - new Date(prev?.created_at ?? 0).getTime() > 60_000
    if (!prev?.error && !stale) return json({ ok: false, error: 'in progress' }, 409)
    // Прошлая попытка упала — пробуем снова, только если успели перехватить бронь.
    const { data: retake } = await db
      .from('site_leads')
      .update({ error: null, created_at: new Date().toISOString() })
      .eq('source', source)
      .eq('external_id', lead.externalId)
      .is('lead_id', null)
      .eq('created_at', prev!.created_at)
      .select('id')
    if (!retake?.length) return json({ ok: false, error: 'in progress' }, 409)
  }

  const call = amo(Deno.env.get('AMO_DOMAIN') ?? 'neodiamondkz', Deno.env.get('AMO_TOKEN')!)
  try {
    let contactId = await findContact(call, lead.phone)
    const found = !!contactId
    if (!contactId) {
      const c = await call('POST', 'contacts', [contactPayload(lead)])
      contactId = c?._embedded?.contacts?.[0]?.id
      if (!contactId) throw new Error('contact not created')
    }
    const l = await call('POST', 'leads', [leadPayload(lead, contactId, PIPELINE)])
    const leadId = l?._embedded?.leads?.[0]?.id
    if (!leadId) throw new Error('lead not created')

    const note = leadNote(lead)
    if (note) {
      try {
        await call('POST', `leads/${leadId}/notes`, [{ note_type: 'common', params: { text: note } }])
      } catch (e) {
        console.error(`note ${leadId}: ${(e as Error).message}`)
      }
    }

    await db.from('site_leads').update({ lead_id: leadId, contact_id: contactId, contact_found: found }).eq('source', source).eq('external_id', lead.externalId)
    const p = lead.parsed
    const { error } = await db.from('crm_inquiries').insert({
      lead_id: leadId,
      channel: 'site',
      kind: p.kind,
      code: p.code,
      brand: p.brand,
      entry: p.entry,
      type: p.type,
      page: p.page,
      ad_id: null,
      ad_short: p.adShort,
      utm: p.utm,
      is_new: true,
    })
    if (error) console.error(`crm_inquiries: ${error.message}`)
    console.log(JSON.stringify({ leadId, contactId, found, code: p.code }))
    return json({ ok: true, lead_id: leadId, contact_id: contactId, duplicate: false, contact_found: found })
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500)
    console.error(msg)
    // Ошибка в брони: повтор сайта сможет попробовать ещё раз.
    await db.from('site_leads').update({ error: msg }).eq('source', source).eq('external_id', lead.externalId)
    await db.from('integrations').update({ last_error: `site-lead: ${msg}` }).eq('key', 'amocrm')
    return json({ ok: false, error: 'amocrm' }, 502)
  }
})
