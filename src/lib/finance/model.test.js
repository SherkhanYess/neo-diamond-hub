import { describe, it, expect } from 'vitest'
import { computeModel, copyModel, fundRow, requiredRevenue } from './model.js'
import { prepareRules } from './classify.js'
import raw from './fixtures/rules.json'
import base from './fixtures/model-sep.json'

const R = prepareRules(raw)
const m = computeModel(base, R)
const f = (key) => fundRow(m, key)
const sales = 79206041.98 / 1000000

describe('финмодель (скрин 1 ТЗ)', () => {
  it('продажи = выручка ÷ чек', () => {
    expect(m.sales).toBeCloseTo(sales, 6)
  })
  it('переменные: % от выручки и ₸ на продажу', () => {
    expect(f('taxes').sum).toBeCloseTo(79206041.98 * 0.016, 2)
    expect(f('purchases').sum).toBeCloseTo(469300 * sales, 2)
    expect(f('purchases').perSale).toBeCloseTo(469300, 6)
    expect(f('purchases').pct).toBeCloseTo(0.4693, 6)
    expect(f('piece').pct).toBeCloseTo(0.0279, 6)
  })
  it('маржа = выручка − прямые переменные', () => {
    const variable = ['taxes', 'pct_sales', 'piece', 'purchases', 'transport'].reduce((a, k) => a + f(k).sum, 0)
    expect(m.margin).toBeCloseTo(79206041.98 - variable, 2)
    expect(m.blocks.find((b) => b.key === 'variable').total).toBeCloseTo(variable, 2)
  })
  it('управление: дивиденды и развитие — суммы (уровень необходимости), реклама — % маржи', () => {
    expect(f('ads').sum).toBeCloseTo(m.margin * 0.15, 2)
    expect(f('development').sum).toBe(3500000)
    expect(f('development').pct).toBeCloseTo(3500000 / m.margin, 8)
    expect(f('dividends').dividends).toBe(21000000)
    expect(f('dividends').charity).toBe(525000)
    expect(f('dividends').sum).toBe(21525000)
  })
  it('от дивидендов: нужная выручка — при ней остаток 0', () => {
    const need = requiredRevenue(base, prepareRules(raw))
    expect(need.revenue).toBeGreaterThan(79206041.98)
    const at = computeModel({ ...base, revenue: need.revenue }, R)
    expect(Math.abs(at.rest)).toBeLessThan(1)
    expect(need.sales).toBeCloseTo(need.revenue / 1000000, 6)
    expect(m.requiredRevenue).toBeCloseTo(need.revenue, 2)
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
