// Заявка с сайта без WhatsApp (сейчас — «Намекнуть партнёру» на taena) → сделка amoCRM.
//
// Сайт шлёт заявку в Edge Function site-lead; ключ amoCRM есть только у хаба.
// Код заявки разбирается тем же parseInquiry, что и код из WhatsApp, поэтому
// источник, конвертер и бренд в хабе считаются одинаково для обоих путей.
// Здесь — чистые функции (проверка, телефон, поля сделки), сеть — в index.ts.
import { parseInquiry } from './inquiry.js'

export const FIELDS = {
  code: 424891,
  lead_source: 411029,
  city: 409769,
  occasion: 420033,
  utm_source: 61411,
  utm_medium: 61407,
  utm_campaign: 61409,
  utm_content: 61405,
  utm_term: 61413,
}
export const LEAD_SOURCE = { site: 271935, site_guide: 295499 }
export const CITY = { almaty: 268607, astana: 268609 }
export const OCCASION_PROPOSAL = 284327 // «Повод покупки: Предложение»

/** Типы заявок, которые сайт может прислать сюда. */
export const LEAD_TYPES = { hint: { label: 'Намёк', codeType: 'НМ' } }

/** Казахстанский номер → +7XXXXXXXXXX; иначе null. */
export function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1)
  if (d.length === 10 && d.startsWith('7')) d = '7' + d
  return /^7\d{10}$/.test(d) ? `+${d}` : null
}

/** Совпадают ли телефоны (по последним 10 цифрам). */
export const samePhone = (a, b) => {
  const x = String(a ?? '').replace(/\D/g, '').slice(-10)
  return x.length === 10 && x === String(b ?? '').replace(/\D/g, '').slice(-10)
}

const clip = (v, n) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, n) : null
}

/**
 * Проверка тела запроса. Возвращает { ok, error } или { ok, lead }.
 * Код без признака сайта/намёка заменяется на «прямой заход» — заявка всё равно
 * должна попасть в amoCRM, а источник тогда честно «без источника».
 */
export function validate(body) {
  const b = body && typeof body === 'object' ? body : {}
  const type = String(b.type ?? '')
  if (!LEAD_TYPES[type]) return { ok: false, error: 'unknown type' }
  const phone = normalizePhone(b.phone)
  if (!phone) return { ok: false, error: 'bad phone' }
  const externalId = clip(b.hint_id ?? b.external_id, 100)
  if (!externalId) return { ok: false, error: 'hint_id required' }

  let parsed = parseInquiry(String(b.code ?? ''), null)
  if (parsed.kind !== 'site' || parsed.type !== type) {
    parsed = parseInquiry(`[T·dd-${LEAD_TYPES[type].codeType}·o]`, null)
  }
  const city = CITY[String(b.city ?? '').toLowerCase()] ? String(b.city).toLowerCase() : null
  let link = clip(b.link, 500)
  if (link && !/^https:\/\//.test(link)) link = null
  return {
    ok: true,
    lead: {
      type,
      externalId,
      phone,
      name: clip(b.name, 80),
      ring: clip(b.ring, 160),
      link,
      size: clip(b.size, 20),
      city,
      parsed,
    },
  }
}

/**
 * Название сделки: «Намек с сайта 12542893» — номер самой сделки amoCRM (решение
 * владельца, «Намек» через «е»). Номер известен только после создания: сделка
 * создаётся с именем без номера, затем имя дописывается PATCH-ем.
 */
export function leadName(leadId = null) {
  return leadId ? `Намек с сайта ${leadId}` : 'Намек с сайта'
}

/** Поля новой сделки: код, UTM, «Источник лида», город, повод. */
export function leadFields(lead) {
  const p = lead.parsed
  const cf = [{ field_id: FIELDS.code, values: [{ value: p.code }] }]
  for (const [k, v] of Object.entries(p.utm)) if (v && FIELDS[k]) cf.push({ field_id: FIELDS[k], values: [{ value: v }] })
  const src = p.page === 'guide' ? LEAD_SOURCE.site_guide : LEAD_SOURCE.site
  cf.push({ field_id: FIELDS.lead_source, values: [{ enum_id: src }] })
  if (lead.city) cf.push({ field_id: FIELDS.city, values: [{ enum_id: CITY[lead.city] }] })
  if (lead.type === 'hint') cf.push({ field_id: FIELDS.occasion, values: [{ enum_id: OCCASION_PROPOSAL }] })
  return cf
}

/** Примечание для менеджера. */
export function leadNote(lead) {
  if (lead.type !== 'hint') return ''
  return [
    'Намёк с сайта taena: девушка выбрала кольцо и отправила намёк. Пишем ему.',
    lead.ring && `Кольцо: ${lead.ring}`,
    lead.size ? `Её размер: ${lead.size} — говорим, только когда он напишет сам` : 'Размер она не знает — зовём их вдвоём на примерку',
    lead.link && `Ссылка, которую он получил: ${lead.link}`,
    `Код: ${lead.parsed.code}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Тело POST /leads. contactId — найденный или созданный контакт. */
export function leadPayload(lead, contactId, pipelineId = null) {
  const out = {
    name: leadName(),
    custom_fields_values: leadFields(lead),
    _embedded: {
      contacts: [{ id: contactId }],
      tags: lead.parsed.brand === 'taena' ? [{ name: 'taena' }] : [],
    },
  }
  if (pipelineId) out.pipeline_id = pipelineId
  return out
}

/** Тело POST /contacts для нового контакта. */
export function contactPayload(lead) {
  return {
    name: lead.name || 'Без имени (намёк)',
    custom_fields_values: [{ field_code: 'PHONE', values: [{ value: lead.phone, enum_code: 'MOB' }] }],
  }
}
