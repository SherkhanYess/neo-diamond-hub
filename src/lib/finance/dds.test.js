import { describe, it, expect } from 'vitest'
import { buildDds, daysOf } from './dds.js'
import { prepareRules } from './classify.js'
import raw from './fixtures/rules.json'
import sep from './fixtures/sep2026.json'

const R = prepareRules(raw)
const d = buildDds({ month: '2026-09', txs: sep, R, opening: 19872188.03 })
const row = (key) => d.rows.find((r) => r.key === key)
const item = (key) => d.rows.flatMap((r) => r.items ?? []).find((i) => i.key === key)
// Долларовые операции пересчитаны по курсу каждой операции; эталон допускает расхождение
// «до округления курса» (в самом эталоне — 8 ₸). Суммы без долларов сверяем точно.
const near = (v, target) => expect(Math.abs(v - target)).toBeLessThan(15)

describe('ДДС по фондам — эталон сентября 2026 (ТЗ, без статуэтки)', () => {
  it('поступления', () => {
    expect(Math.round(d.totals.incomeGross)).toBe(50189574)
    expect(Math.round(d.totals.cash)).toBe(27473574)
    expect(Math.round(d.totals.bank)).toBe(22716000)
  })
  it('выплаты с эквайрингом и возвратами', () => {
    near(d.totals.payments + d.totals.acquiring + d.totals.refunds, 59324471)
  })
  it('сальдо с курсовыми', () => {
    expect(Math.abs(d.totals.net + d.totals.fx - -9170575)).toBeLessThan(15)
  })
  it('остаток на конец месяца как в Adesk (статуэтка движет деньги, но не потоки)', () => {
    expect(Math.abs(d.totals.closing - 13669273.03)).toBeLessThan(15)
  })
  it('всё разнесено', () => {
    expect(d.unassigned).toEqual([])
  })
  it('строки фондов', () => {
    near(item('ads.ads').total, 5249744)
    expect(item('rent.almaty').total).toBe(1500000)
    expect(item('rent.astana').total).toBe(400000)
    expect(item('pct_sales.bonus_danelya').total).toBe(775380)
    expect(item('salaries.danelya').total).toBe(300000)
    near(row('fund:purchases').total, 27372375 - 2340)
  })
  it('направления поступлений: заказы и из наличия', () => {
    expect(Math.round(row('in:orders').total)).toBe(43124605 - 3000000)
    expect(Math.round(row('in:stock').total)).toBe(8744969 + 1300000)
  })
  it('по дням: сумма дней = итог; остатки по цепочке', () => {
    const r = row('fund:purchases')
    expect(Math.round(Object.values(r.byDay).reduce((a, b) => a + b, 0))).toBe(Math.round(r.total))
    expect(row('opening').byDay['2026-09-01']).toBe(19872188.03)
    expect(daysOf('2026-09')).toHaveLength(30)
  })
  it('платежи за прошлый месяц помечены', () => {
    expect(item('dividends.dividends').prior).toBeGreaterThan(11000000)
  })
})

describe('поступление без сделки и возврат на ту же сумму', () => {
  const mk = (o) => ({ id: 1, date: '2026-10-28', related_date: null, type: 1, amount: 0, amount_kzt: 1740000, account_id: 242477, category_id: 1469454,
    project_id: null, project_type: null, project_name: null, is_transfer: false, description: 'Султан', contractor: null, ...o })
  const txs = [mk({}), mk({ id: 2, date: '2026-10-29', type: 2, category_id: 1469483, description: null }), mk({ id: 3, date: '2026-10-05', amount_kzt: 50000, description: 'Голд Жанар' })]
  const d = buildDds({ month: '2026-10', txs, R, opening: 1000000 })
  it('гасят друг друга: не выручка и не возврат, видны отдельной строкой', () => {
    expect(d.totals.incomeGross).toBe(50000)
    expect(d.totals.refunds).toBe(0)
    expect(d.rows.find((r) => r.key === 'paired').pairs).toBe(1)
    expect(d.totals.closing).toBe(1050000)
  })
})

describe('оклад из финмодели месяца', () => {
  it('Айсултан с окладом 500 000: 720 000 = 500 000 + 220 000 KPI', () => {
    const d2 = buildDds({ month: '2026-09', txs: sep, R, opening: 0, okladByItem: new Map([['salaries.aisultan', 500000]]) })
    const it2 = (k) => d2.rows.flatMap((r) => r.items ?? []).find((i) => i.key === k)
    expect(it2('salaries.aisultan').total).toBe(500000 + 100000) // август до оклада + аванс сентября
    expect(it2('piece.kpi_marketing').total).toBe(220000 + 54600) // + сверх оклада Аружан (254 600 − 200 000)
  })
})
