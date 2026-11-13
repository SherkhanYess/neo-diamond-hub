import { describe, it, expect } from 'vitest'
import { normalizePhone, samePhone, validate, leadName, leadFields, leadNote, leadPayload, FIELDS, LEAD_SOURCE, CITY, OCCASION_PROPOSAL } from './siteLead.js'

const hint = {
  type: 'hint',
  hint_id: 'h_123',
  code: '[T·ia:51l97-НМ·m]',
  name: 'Ержан',
  phone: '8 (701) 123-45-67',
  ring: 'Sirius Luxe · 1 ct · белое золото',
  link: 'https://taena.neodiamond.kz/hint/abc',
  size: '16.5',
  city: 'almaty',
}

describe('normalizePhone', () => {
  it('8…, +7…, 7…, 10 цифр → +7XXXXXXXXXX', () => {
    for (const p of ['87011234567', '+7 701 123 45 67', '77011234567', '7011234567']) expect(normalizePhone(p)).toBe('+77011234567')
  })
  it('мусор и чужие номера → null', () => {
    for (const p of ['', null, '12345', '+1 202 555 0101', '9011234567']) expect(normalizePhone(p)).toBe(null)
  })
  it('samePhone сравнивает по 10 последним цифрам', () => {
    expect(samePhone('+7 (701) 123-45-67', '87011234567')).toBe(true)
    expect(samePhone('+77011234568', '87011234567')).toBe(false)
    expect(samePhone('', '')).toBe(false)
  })
})

describe('validate', () => {
  it('нормальный намёк', () => {
    const r = validate(hint)
    expect(r.ok).toBe(true)
    expect(r.lead).toMatchObject({ type: 'hint', externalId: 'h_123', phone: '+77011234567', city: 'almaty', size: '16.5' })
    expect(r.lead.parsed).toMatchObject({ kind: 'site', brand: 'taena', entry: 'ia', type: 'hint', page: 'model', adShort: '51l97' })
  })
  it('без телефона, типа или id — отказ', () => {
    expect(validate({ ...hint, phone: '123' })).toEqual({ ok: false, error: 'bad phone' })
    expect(validate({ ...hint, type: 'price' })).toEqual({ ok: false, error: 'unknown type' })
    expect(validate({ ...hint, hint_id: '' })).toEqual({ ok: false, error: 'hint_id required' })
    expect(validate(null).ok).toBe(false)
  })
  it('битый или чужой код → прямой заход, тип намёк', () => {
    for (const code of ['', 'привет', '[T·ia-ПР·m]', '[ad·120246670349460187]']) {
      const r = validate({ ...hint, code })
      expect(r.lead.parsed).toMatchObject({ kind: 'site', code: '[T·dd-НМ·o]', entry: 'dd', type: 'hint' })
    }
  })
  it('ссылка только https, неизвестный город → null', () => {
    const r = validate({ ...hint, link: 'javascript:alert(1)', city: 'paris' })
    expect(r.lead.link).toBe(null)
    expect(r.lead.city).toBe(null)
  })
})

describe('поля сделки', () => {
  const lead = validate(hint).lead
  it('название', () => {
    expect(leadName(lead)).toBe('Намек с сайта +77011234567')
  })
  it('код, UTM как у WhatsApp, источник «Сайт», город, повод', () => {
    const cf = Object.fromEntries(leadFields(lead).map((f) => [f.field_id, f.values[0].value ?? f.values[0].enum_id]))
    expect(cf).toEqual({
      [FIELDS.code]: '[T·ia:51l97-НМ·m]',
      [FIELDS.utm_source]: 'instagram',
      [FIELDS.utm_medium]: 'site',
      [FIELDS.utm_campaign]: 'model',
      [FIELDS.utm_content]: 'ia',
      [FIELDS.utm_term]: '51l97',
      [FIELDS.lead_source]: LEAD_SOURCE.site,
      [FIELDS.city]: CITY.almaty,
      [FIELDS.occasion]: OCCASION_PROPOSAL,
    })
  })
  it('из гида — источник «Сайт (Гайд)»', () => {
    const g = validate({ ...hint, code: '[T·is-НМ·g]' }).lead
    expect(leadFields(g).find((f) => f.field_id === FIELDS.lead_source).values[0].enum_id).toBe(LEAD_SOURCE.site_guide)
  })
  it('примечание: размер или «на примерку вдвоём»', () => {
    expect(leadNote(lead)).toContain('Её размер: 16.5 — говорим, только когда он напишет сам')
    expect(leadNote({ ...lead, size: null })).toContain('зовём их вдвоём на примерку')
  })
  it('сделка привязана к контакту, тег taena, воронка', () => {
    const p = leadPayload(lead, 42, 9907362)
    expect(p._embedded).toEqual({ contacts: [{ id: 42 }], tags: [{ name: 'taena' }] })
    expect(p.pipeline_id).toBe(9907362)
  })
})
