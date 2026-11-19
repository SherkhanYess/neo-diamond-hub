import { describe, it, expect } from 'vitest'
import { computeModel, copyModel, fundRow, requiredRevenue } from './model.js'
import { prepareRules } from './classify.js'
import raw from './fixtures/rules.json'
import base from './fixtures/model-sep.json'

const R = prepareRules(raw)
const m = computeModel(base, R)
const f = (key) => fundRow(m, key)
// Уровень необходимости: выручка — результат. Дивиденды 21 000 000 (благотворительность внутри),
// развитие 3 500 000, постоянные 5 318 000 → нужная выручка 80 832 560,7 (сверено с таблицей владельца
// после исправления «Сумм расчетов» на 29 818 000).
const NEED = 29818000 / 0.84 / 0.43915
const sales = NEED / 1000000

describe('финмодель (скрин 1 ТЗ)', () => {
  it('продажи = выручка ÷ чек', () => {
    expect(m.sales).toBeCloseTo(sales, 6)
  })
  it('переменные: % от выручки и ₸ на продажу', () => {
    expect(f('taxes').sum).toBeCloseTo(NEED * 0.016, 2)
    expect(f('purchases').sum).toBeCloseTo(469300 * sales, 2)
    expect(f('purchases').perSale).toBeCloseTo(469300, 6)
    expect(f('purchases').pct).toBeCloseTo(0.4693, 6)
    expect(f('piece').pct).toBeCloseTo(0.0279, 6)
  })
  it('маржа = выручка − прямые переменные', () => {
    const variable = ['taxes', 'pct_sales', 'piece', 'purchases', 'transport'].reduce((a, k) => a + f(k).sum, 0)
    expect(m.margin).toBeCloseTo(NEED - variable, 2)
    expect(m.blocks.find((b) => b.key === 'variable').total).toBeCloseTo(variable, 2)
  })
  it('управление: дивиденды и развитие — суммы (уровень необходимости), реклама — % маржи', () => {
    expect(f('ads').sum).toBeCloseTo(m.margin * 0.15, 2)
    expect(f('development').sum).toBe(3500000)
    expect(f('development').pct).toBeCloseTo(3500000 / m.margin, 8)
    expect(f('dividends').sum).toBe(21000000) // благотворительность — из дивидендов
    expect(f('dividends').charity).toBe(525000)
    expect(f('dividends').payout).toBe(20475000)
  })
  it('requiredRevenue совпадает с выручкой модели', () => {
    const need = requiredRevenue(base, R)
    expect(need.revenue).toBeCloseTo(m.revenue, 6)
    expect(need.sales).toBeCloseTo(m.sales, 6)
  })
  it('нужная выручка — нет решения, если переменные съедают всю выручку', () => {
    const bad = { ...base, funds: { ...base.funds, purchases: { mode: 'pct', value: 100 } } }
    expect(requiredRevenue(bad, R)).toBe(null)
  })
  it('постоянные — сумма строк, итоги только формулами (ошибки ТЗ исчезли)', () => {
    expect(f('salaries').sum).toBe(3050000)
    expect(f('other').sum).toBe(268000)
    expect(f('rent').sum).toBe(1900000)
    expect(m.blocks.find((b) => b.key === 'fixed').total).toBe(1900000 + 100000 + 3050000 + 268000)
    expect(f('salaries').items.find((i) => i.key === 'salaries.aisultan').sum).toBe(450000)
  })
  it('выручка — результат: 80 832 561, остаток 0', () => {
    expect(m.revenue).toBeCloseTo(80832560.7, 0)
    expect(m.margin).toBeCloseTo(35497619.05, 1)
    expect(f('reserve').sum).toBeCloseTo(354976.19, 1)
    expect(f('ads').sum).toBeCloseTo(5324642.86, 1)
    expect(Math.abs(m.rest)).toBeLessThan(0.01)
  })
  it('введённая выручка не влияет', () => {
    expect(computeModel({ ...base, revenue: 1 }, R).revenue).toBeCloseTo(m.revenue, 6)
  })
  it('остаток = маржа − управление − постоянные', () => {
    const b = (k) => m.blocks.find((x) => x.key === k).total
    expect(m.rest).toBeCloseTo(m.margin - b('management') - b('fixed'), 2)
  })
  it('нет чека — продаж нет, деления на ноль нет', () => {
    const z = computeModel({ ...base, avg_check: 0 }, R)
    expect(z.sales).toBe(0)
    expect(fundRow(z, 'purchases').sum).toBe(0)
    expect(Number.isFinite(fundRow(z, 'taxes').sum)).toBe(true)
  })
  it('нет решения — помечено', () => {
    const bad = { ...base, funds: { ...base.funds, purchases: { mode: 'pct', value: 100 } } }
    expect(computeModel(bad, R).unsolvable).toBe(true)
  })
})

describe('copyModel', () => {
  it('новый месяц — независимая копия', () => {
    const c = copyModel(base, '2026-12-01')
    expect(c.month).toBe('2026-12-01')
    c.funds.taxes.value = 99
    c.items['rent.almaty'] = 1
    expect(base.funds.taxes.value).toBe(1.6)
    expect(base.items['rent.almaty']).toBe(1500000)
  })
})
