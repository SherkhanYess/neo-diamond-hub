import { describe, it, expect } from 'vitest'
import { amountKzt, txRow, accountKind, projectRow } from './adesk.js'

const usd = {
  id: 1, type: 2, amount: '377.72', exchangeRate: 439.39414, dateIso: '2026-09-30', relatedDateIso: '2026-09-30',
  bankAccount: { id: 242480, currency: 'USD', rate: 444.44 }, category: { id: 1469525, name: 'Реклама' },
  isTransfer: false, description: null, contractor: { name: 'Meta' }, project: { id: 7, type: 'deal' },
}

describe('adesk', () => {
  it('тенге: KZT как есть, валюта × курс операции', () => {
    expect(amountKzt({ ...usd, bankAccount: { currency: 'KZT' } })).toBe(377.72)
    expect(amountKzt(usd)).toBeCloseTo(377.72 * 439.39414, 1)
    expect(amountKzt({ ...usd, exchangeRate: null })).toBeCloseTo(377.72 * 444.44, 1)
  })
  it('строка операции', () => {
    expect(txRow(usd)).toMatchObject({
      id: 1, date: '2026-09-30', related_date: '2026-09-30', type: 2, amount: 377.72, account_id: 242480,
      category_id: 1469525, project_id: 7, is_transfer: false, contractor: 'Meta',
    })
    expect(txRow({ ...usd, isTransfer: null, category: null }).category_id).toBe(null)
  })
  it('перевод распознаётся и по статье', () => {
    expect(txRow({ ...usd, isTransfer: null, category: { id: 9, name: 'Перевод между счетами' } }).is_transfer).toBe(true)
  })
  it('вид счёта по названию', () => {
    expect(accountKind('Наличные (тенге)')).toBe('cash')
    expect(accountKind('Наличные (доллар)')).toBe('cash')
    expect(accountKind('Цифровая наличка')).toBe('cash')
    expect(accountKind('Kaspi Pay')).toBe('bank')
    expect(accountKind('Online Bank (тенге)')).toBe('bank')
    expect(accountKind('Фонд маркетинга (долларовый счет)')).toBe('fund')
    expect(accountKind('Личные деньги Шерхана')).toBe('other')
  })
  it('сделка: дата акта и сумма', () => {
    expect(projectRow({ id: 5, type: 'deal', name: '6579 сентябрь', actDate: '2026-09-30', dealAmount: '900000.00', category: { name: 'Конструктор (под заказ)' } }))
      .toMatchObject({ id: 5, type: 'deal', act_date: '2026-09-30', deal_amount: 900000, category: 'Конструктор (под заказ)' })
  })
})
