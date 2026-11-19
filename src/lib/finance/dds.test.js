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
