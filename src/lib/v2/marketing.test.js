import { describe, it, expect } from 'vitest'
import { sourceCards, converterFunnels, performanceTree, adStatus } from './marketing'
import { spendIndex } from './metrics'

const B = 'nd'
const stages = { qual: 'q', set: 's', held: 'h', sale: 'x' }
const sources = [
  { id: 'ig', brand_id: B, name: 'Instagram', is_archived: false },
  { id: '2gis', brand_id: B, name: '2ГИС', is_archived: false },
  { id: 'old', brand_id: B, name: 'Старый', is_archived: true },
]
const converters = [
  { id: 'prof', brand_id: B, demand_source_id: 'ig', name: 'Профиль' },
  { id: 'ads', brand_id: B, demand_source_id: 'ig', name: 'Реклама' },
]
const deals = [
  { id: 'a', brand_id: B, demand_source_id: 'ig', converter_id: 'prof', client_task_id: 'T', sale_at: '2026-11-02', revenue: 1000 },
  { id: 'b', brand_id: B, demand_source_id: 'ig', converter_id: 'prof' },
  { id: 'c', brand_id: B, demand_source_id: 'ig', converter_id: 'ads', ad_id: '111', utm_campaign: 'C1', is_ignored: true },
  { id: 'd', brand_id: B, demand_source_id: 'ig', converter_id: 'ads', ad_id: '111', utm_campaign: 'C1', client_task_id: 'T', sale_at: '2026-11-05', revenue: 500 },
  { id: 'e', brand_id: B, demand_source_id: 'ig', converter_id: 'ads', utm_campaign: 'C1' }, // no ad id
  { id: 'f', brand_id: B, demand_source_id: '2gis', converter_id: null },
]
const events = [
  { deal_id: 'a', stage_id: 'q' }, { deal_id: 'a', stage_id: 's' }, { deal_id: 'a', stage_id: 'h' },
  { deal_id: 'd', stage_id: 'q' }, { deal_id: 'd', stage_id: 'h' },
]

describe('sourceCards', () => {
  const { bySource } = spendIndex([{ brand_id: B, demand_source_id: 'ig', spend: 300 }], [])
  const { cards } = sourceCards({
    deals, events, plans: [], spendBySource: bySource, spendBrands: new Set([B]), stages, sources,
  })
  it('counts leads, quals and revenue per source', () => {
    const ig = cards.find((c) => c.source.id === 'ig')
    expect(ig.fact.leads).toBe(5)
    expect(ig.fact.quals).toBe(2)
    expect(ig.fact.revenue).toBe(1500)
    expect(ig.factM.roas).toBe(5) // 1500 / 300
  })
  it('hides archived sources with no activity', () => {
    expect(cards.some((c) => c.source.id === 'old')).toBe(false)
  })
})

describe('converterFunnels', () => {
  const { byConverter } = spendIndex([{ brand_id: B, converter_id: 'ads', demand_source_id: 'ig', spend: 300 }], [])
  const igDeals = deals.filter((d) => d.demand_source_id === 'ig')
  const { rows } = converterFunnels({
    deals: igDeals, events, stages, converters, spendByConverter: byConverter, spendKnown: true,
    entries: new Map([['ads', 60], ['prof', 0]]), brandId: B,
  })
  const prof = rows.find((r) => r.converter.id === 'prof')
  const ads = rows.find((r) => r.converter.id === 'ads')
  it('builds the step funnel per converter', () => {
    expect(prof.leads).toBe(2)
    expect(prof.held).toBe(1)
    expect(prof.sales).toBe(1)
    expect(ads.leads).toBe(3)
  })
  it('prices leads and quals of a converter', () => {
    expect(ads.cpl).toBe(100) // 300 / 3
    expect(ads.cpq).toBe(300) // 300 / 1
    expect(ads.cr_entry_lead).toBeCloseTo(0.05, 5) // 3 / 60 clicks
  })
  it('treats zero entries with real leads as «нет данных о входе»', () => {
    expect(prof.entry).toBeNull()
    expect(prof.cr_entry_lead).toBeNull()
  })
  it('reports the ignore share', () => {
    expect(ads.ignore_share).toBeCloseTo(1 / 3, 5)
  })
})

describe('performanceTree', () => {
  const entities = [
    { id: 'c1', level: 'campaign', parent_id: null, external_id: 'c-1' },
    { id: 'g1', level: 'group', parent_id: 'c1', external_id: 'g-1' },
    { id: 'ad1', level: 'ad', parent_id: 'g1', external_id: '111' },
  ]
  const stats = [
    { ad_entity_id: 'ad1', spend: 200, impressions: 1000, clicks: 40 },
    { ad_entity_id: 'ad1', spend: 100, impressions: 1000, clicks: 20 },
  ]
  const igDeals = deals.filter((d) => d.demand_source_id === 'ig')
  const { campaigns, noAd } = performanceTree({ entities, stats, deals: igDeals, events, stages, minQuals: 10 })
  it('sums daily stats and attaches deals by ad id', () => {
    const ad = campaigns[0].children[0].children[0]
    expect(ad.spend).toBe(300)
    expect(ad.leads).toBe(2)
    expect(ad.sales).toBe(1)
    expect(ad.ctr).toBeCloseTo(0.03, 5)
  })
  it('rolls ads up to the campaign', () => {
    expect(campaigns[0].spend).toBe(300)
    expect(campaigns[0].revenue).toBe(500)
    expect(campaigns[0].low_data).toBe(true)
  })
  it('collects campaign leads without a known ad as «Без объявления»', () => {
    expect(noAd.leads).toBe(1)
  })
})

describe('статусы РК в Performance', () => {
  const ents = [
    { id: 'off', level: 'campaign', parent_id: null, external_id: 'c-off', status: 'PAUSED' },
    { id: 'idle', level: 'campaign', parent_id: null, external_id: 'c-idle', status: 'ARCHIVED' },
    { id: 'on', level: 'campaign', parent_id: null, external_id: 'c-on', status: 'ACTIVE' },
    { id: 'g-off', level: 'group', parent_id: 'off', external_id: 'g-off', status: 'CAMPAIGN_PAUSED' },
    { id: 'a-off', level: 'ad', parent_id: 'g-off', external_id: '1', status: 'CAMPAIGN_PAUSED' },
    { id: 'g-on', level: 'group', parent_id: 'on', external_id: 'g-on', status: 'ACTIVE' },
    { id: 'a-on', level: 'ad', parent_id: 'g-on', external_id: '2', status: 'ACTIVE' },
  ]
  const stats = [
    { ad_entity_id: 'a-off', spend: 900, impressions: 0, clicks: 0 },
    { ad_entity_id: 'a-on', spend: 100, impressions: 0, clicks: 0 },
  ]
  const t = performanceTree({ entities: ents, stats, deals: [], events: [], stages })
  it('работающие — первыми, даже с меньшим расходом', () => {
    expect(t.campaigns.map((c) => c.entity.id)).toEqual(['on', 'off', 'idle'])
  })
  it('отключённые без расхода и лидов — «без активности»', () => {
    expect(t.campaigns.map((c) => c.idle)).toEqual([false, false, true])
    expect(t.idle).toBe(1)
  })
  it('коды Meta → работает / отключена / ошибка', () => {
    expect(adStatus('ACTIVE').key).toBe('active')
    expect(adStatus('ADSET_PAUSED').key).toBe('off')
    expect(adStatus('DISAPPROVED').key).toBe('issue')
    expect(adStatus(null)).toMatchObject({ key: 'off', unknown: true })
  })
})
