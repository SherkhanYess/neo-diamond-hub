import { describe, it, expect } from 'vitest'
import { classify, prepareRules, itemKeyOf } from './classify.js'
import raw from './fixtures/rules.json'

const R = prepareRules(raw)
const base = { id: 1, date: '2026-09-10', related_date: '2026-09-10', type: 2, amount: 1000, amount_kzt: 1000, account_id: 242477,
  category_id: null, project_id: null, project_type: null, project_name: null, is_transfer: false, description: null, contractor: null }
const tx = (o) => ({ ...base, ...o })
const run = (t, ctx = { okladUsed: new Map() }) => classify(t, R, ctx)
const key = (r) => itemKeyOf(R, r.itemId)

describe('classify', () => {
  it('статуэтка исключается отовсюду', () => {
    expect(run(tx({ type: 1, project_type: 'deal', project_name: '9612 сентябрь Статуетка' })).kind).toBe('excluded')
    expect(run(tx({ category_id: 1469494, project_name: '9612 сентябрь Статуетка' })).kind).toBe('excluded')
  })
  it('перевод, эквайринг, возврат', () => {
    expect(run(tx({ is_transfer: true })).kind).toBe('transfer')
    expect(run(tx({ category_id: 583226 })).kind).toBe('acquiring')
    expect(run(tx({ category_id: 2071983 })).kind).toBe('refund')
  })
  it('поступление: направление по сделке, деньги по счёту', () => {
    expect(run(tx({ type: 1, project_type: 'deal', account_id: 242475 }))).toMatchObject({ kind: 'income', direction: 'orders', money: 'bank' })
    expect(run(tx({ type: 1, project_type: 'product_deal', account_id: 303498 }))).toMatchObject({ kind: 'income', direction: 'stock', money: 'cash' })
    expect(run(tx({ type: 1, account_id: 242477 }))).toMatchObject({ kind: 'income', direction: 'other', money: 'cash' })
  })
  it('продажник: оклад 300 000, остальное — бонус', () => {
    const r = run(tx({ category_id: 1469548, amount_kzt: 1075380, description: 'Данеля', related_date: '2026-08-31' }))
    expect(r.split.map((s) => [itemKeyOf(R, s.itemId), s.amount])).toEqual([['salaries.danelya', 300000], ['pct_sales.bonus_danelya', 775380]])
  })
  it('оклад исчерпывается по месяцу начисления', () => {
    const ctx = { okladUsed: new Map() }
    const a = run(tx({ category_id: 1526858, amount_kzt: 720000, description: 'Айсултан', related_date: '2026-08-31' }), ctx)
    expect(a.split.map((s) => s.amount)).toEqual([450000, 270000])
    expect(itemKeyOf(R, a.split[1].itemId)).toBe('piece.kpi_marketing')
    const b = run(tx({ category_id: 1526858, amount_kzt: 100000, description: 'Айсултан - АВАНС', related_date: '2026-09-30' }), ctx)
    expect(b.split.map((s) => [itemKeyOf(R, s.itemId), s.amount])).toEqual([['salaries.aisultan', 100000]])
    const c = run(tx({ category_id: 1578117, amount_kzt: 400000, contractor: 'Наргиза Чыныбаевна Б.', related_date: '2026-08-31' }), ctx)
    const d = run(tx({ category_id: 1578117, amount_kzt: 189000, description: 'Наргиза', related_date: '2026-08-31' }), ctx)
    expect(key(c)).toBe('salaries.nargiza')
    expect(d.split.map((s) => [itemKeyOf(R, s.itemId), s.amount])).toEqual([['piece.kpi_nargiza', 189000]])
  })
  it('без «сверх оклада» — всё в оклад (Мухамед по контрагенту)', () => {
    const r = run(tx({ category_id: 583315, amount_kzt: 250000, contractor: 'Yourmarketolog' }))
    expect(key(r)).toBe('salaries.mukhamed')
  })
  it('расход без статьи с долларового фонда маркетинга — реклама', () => {
    expect(key(run(tx({ account_id: 242480, category_id: null })))).toBe('ads.ads')
    expect(run(tx({ account_id: 242477, category_id: null })).itemId).toBe(null)
  })
  it('аренда: Астана по описанию, иначе Алматы', () => {
    expect(key(run(tx({ category_id: 576837, description: 'Астана' })))).toBe('rent.astana')
    expect(key(run(tx({ category_id: 576837 })))).toBe('rent.almaty')
  })
  it('неизвестная статья — не распределено', () => {
    const r = run(tx({ category_id: 999 }))
    expect(r).toMatchObject({ kind: 'expense', itemId: null, fundId: null })
  })
  it('платёж за прошлый месяц — по дате начисления', () => {
    expect(run(tx({ category_id: 1469486, date: '2026-09-19', related_date: '2026-08-31' })).priorMonth).toBe(true)
    expect(run(tx({ category_id: 1469486, date: '2026-09-19', related_date: '2026-09-19' })).priorMonth).toBe(false)
  })
})
