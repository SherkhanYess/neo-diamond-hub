import { describe, it, expect } from 'vitest'
import { parseInquiry, isCodeOnly, adShort, channelOf } from './inquiry.js'

describe('parseInquiry', () => {
  it('ad_id от Kelesu → Реклама → WhatsApp', () => {
    const r = parseInquiry('Здравствуйте!\n📢 Лид с рекламы\nhttps://instagram.com/p/x\nad_id: 120246670349460187', 'whatsapp')
    expect(r.kind).toBe('ctwa')
    expect(r.code).toBe('[ad·120246670349460187]')
    expect(r.utm).toEqual({ utm_source: 'instagram', utm_medium: 'ctwa', utm_term: '120246670349460187' })
  })

  it('код сайта v2 с объявлением', () => {
    const r = parseInquiry('Здравствуйте! Хотим примерить Sirius. [T·ia:7fq2m-ПР·m]', 'whatsapp')
    expect(r).toMatchObject({ kind: 'site', brand: 'taena', entry: 'ia', type: 'fitting', page: 'model', adShort: '7fq2m' })
    expect(r.code).toBe('[T·ia:7fq2m-ПР·m]')
    expect(r.utm).toEqual({ utm_source: 'instagram', utm_medium: 'site', utm_campaign: 'model', utm_content: 'ia', utm_term: '7fq2m' })
  })

  it('код сайта v2 из гида, пришли из сторис', () => {
    const r = parseInquiry('Хочу узнать про кольца. [T·is-ОБ·g]')
    expect(r).toMatchObject({ kind: 'site', entry: 'is', type: 'price', page: 'guide' })
  })

  it('сайт без меток → без источника', () => {
    expect(parseInquiry('[T·dd-ПД·f]').utm.utm_source).toBe('none')
  })

  it('код профиля: bio и сторис', () => {
    expect(parseInquiry('Здравствуйте! [T·ib]')).toMatchObject({ kind: 'profile', brand: 'taena', entry: 'ib' })
    expect(parseInquiry('Здравствуйте! [N·is]').utm).toEqual({ utm_source: 'instagram', utm_medium: 'stories', utm_content: 'wa' })
  })

  it('старый код сайта taena', () => {
    const r = parseInquiry('Здравствуйте! Понравилось кольцо. [К-ПР·vitrina]')
    expect(r).toMatchObject({ kind: 'site', brand: 'taena', entry: 'ia', type: 'fitting', code: '[К-ПР·vitrina]' })
    expect(r.utm.utm_campaign).toBe('vitrina')
    expect(parseInquiry('[П-ОБ]').utm.utm_source).toBe('instagram')
    expect(parseInquiry('[С-ОБ]').utm.utm_source).toBe('none')
  })

  it('2ГИС по тексту по умолчанию', () => {
    expect(parseInquiry('Здравствуйте!\n\nПишу из приложения 2ГИС.\n\nСколько стоит?').kind).toBe('2gis')
    expect(parseInquiry('пишу из 2gis').code).toBe('[2ГИС]')
  })

  it('Директ без кода', () => {
    expect(parseInquiry('Добрый день, сколько стоит?', 'direct')).toMatchObject({ kind: 'direct', code: '[Директ]' })
  })

  it('WhatsApp без кода → без источника', () => {
    const r = parseInquiry('Добрый день', 'whatsapp')
    expect(r).toMatchObject({ kind: 'none', code: '[WhatsApp]' })
    expect(r.utm).toEqual({ utm_source: 'none', utm_medium: 'whatsapp' })
  })
})

describe('isCodeOnly', () => {
  it('наши записи не разбираются повторно', () => {
    for (const v of ['[T·ib-ОБ·g]', '[T·ia:7fq2m-ПР·m]', '[N·is]', '[К-ПР·vitrina]', '[2ГИС]', '[Директ]', '[WhatsApp]', '[ad·120246670349460187]'])
      expect(isCodeOnly(v)).toBe(true)
  })
  it('текст клиента — разбирается', () => {
    expect(isCodeOnly('Здравствуйте! [T·ib]')).toBe(false)
    expect(isCodeOnly('Тест')).toBe(false)
    expect(isCodeOnly('')).toBe(false)
  })
})

describe('helpers', () => {
  it('adShort — 5 знаков base36', () => {
    expect(adShort('120246670349460187')).toMatch(/^[0-9a-z]{5}$/)
    expect(adShort('abc')).toBeNull()
  })
  it('channelOf', () => {
    expect(channelOf('instagram_business')).toBe('direct')
    expect(channelOf('kz.api.kelesu')).toBe('whatsapp')
    expect(channelOf(null)).toBeNull()
  })
})
