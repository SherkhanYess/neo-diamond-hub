import { describe, it, expect } from 'vitest'
import { saleMonthOf, ordersOf, stockSalesOf, confirmWithAmo, salesOf } from './sales.js'
import { prepareRules } from './classify.js'
import raw from './fixtures/rules.json'
import projects from './fixtures/projects.json'
import sep from './fixtures/sep2026.json'
import amo from './fixtures/amo-sales-sep.json'

const R = prepareRules(raw)
const pay = (o) => ({ id: Math.random(), type: 1, category_id: 1469454, project_id: 1, project_type: 'product_deal', project_name: 'Товар под реализацию - Акмарал', amount_kzt: 0, ...o })

describe('месяц продажи', () => {
  it('акт → месяц акта; нет акта → месяц из названия; иначе месяц создания', () => {
    expect(saleMonthOf({ name: '6579 сентябрь', act_date: '2026-09-30', created: '2026-10-01' })).toBe('2026-09')
    expect(saleMonthOf({ name: '8935 ноябрь', act_date: null, created: '2026-11-12' })).toBe('2026-11')
    expect(saleMonthOf({ name: '1111 декабрь', act_date: null, created: '2027-01-03' })).toBe('2026-12')
    expect(saleMonthOf({ name: '2222', act_date: null, created: '2026-11-05' })).toBe('2026-11')
  })
})

describe('заказы сентября', () => {
  it('49 заказов на 42 138 700 (без статуэтки)', () => {
    const o = ordersOf('2026-09', projects, R)
    expect(o).toHaveLength(49)
    expect(o.reduce((a, x) => a + x.amount, 0)).toBe(42138700)
  })
})

describe('продажи из наличия', () => {
  it('доплата к изделию — одна продажа', () => {
    const s = stockSalesOf('2026-09', [pay({ date: '2026-09-27', amount_kzt: 30000, description: 'Голд Жанар  10 карат овал' }), pay({ date: '2026-09-27', amount_kzt: 1170000, description: '10 карат овал' })], R)
    expect(s).toHaveLength(1)
    expect(s[0].amount).toBe(1200000)
  })
  it('разные изделия и большой разрыв — разные продажи', () => {
    const s = stockSalesOf('2026-09', [
      pay({ date: '2026-09-13', amount_kzt: 600000, description: 'Голд Жанар (Маркиз Люкс 1кт)' }),
      pay({ date: '2026-09-17', amount_kzt: 637000, description: 'голд - Жанара Сириус При люкс 1 карат' }),
      pay({ date: '2026-09-01', amount_kzt: 300000, description: 'Пусеты 1+1' }),
      pay({ date: '2026-09-20', amount_kzt: 50000, description: 'Пусеты 1+1' }),
    ], R)
    expect(s).toHaveLength(4)
  })
  it('возврат 80 % и больше отменяет продажу', () => {
    const s = stockSalesOf('2026-09', [
      pay({ date: '2026-09-13', amount_kzt: 600000, description: 'Маркиз Люкс 1кт' }),
      { ...pay({ date: '2026-09-26', amount_kzt: 500000, description: 'Возврат за Sirius Marquise' }), type: 2, category_id: 2071983 },
    ], R)
    expect(s.filter((x) => !x.cancelled)).toHaveLength(0)
  })
  it('сентябрь: 9–11 продаж из наличия (ошибка ±1–2 допустима)', () => {
    const s = stockSalesOf('2026-09', sep, R).filter((x) => !x.cancelled)
    expect(s.length).toBeGreaterThanOrEqual(9)
    expect(s.length).toBeLessThanOrEqual(11)
  })
})

describe('сверка с amoCRM', () => {
  it('сумма ±5 % и дата ±10 дней', () => {
    const r = confirmWithAmo([{ date: '2026-09-13', amount: 600000 }, { date: '2026-09-13', amount: 999 }], [{ sale_at: '2026-09-15', revenue: 610000 }])
    expect(r.map((x) => x.confirmed)).toEqual([true, false])
  })
  it('итог месяца: заказы + наличие, выручка, чек', () => {
    const t = salesOf('2026-09', { projects, txs: sep, R, amo })
    expect(t.orders).toHaveLength(49)
    expect(t.count).toBe(t.orders.length + t.stock.filter((x) => !x.cancelled).length)
    expect(t.avgCheck).toBeCloseTo(t.revenue / t.count, 6)
  })
})
