// ДДС по фондам за месяц: операции Adesk по дням, разложенные по фондам модели.
//
// Деньги стоят в день операции (кассовый метод). Строки сверху вниз (ТЗ, блок 2):
//   остаток на начало дня → поступления (заказы / из наличия / прочее; нал и безнал; минус
//   эквайринг и возвраты) → платежи по фондам и строкам, «Не распределено» → чистый поток →
//   курсовые разницы при переводах → исключённое (статуэтка) → остаток на конец дня.
// Исключённые операции не входят в потоки, но двигают деньги — поэтому остаток сходится с Adesk.
import { classify, partsOf } from './classify.js'

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

/** Дни месяца 'YYYY-MM' → ['YYYY-MM-01', …]. */
export function daysOf(month) {
  const [y, m] = month.split('-').map(Number)
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
}
export const weekdayOf = (day) => WD[new Date(`${day}T00:00:00Z`).getUTCDay()]

const add = (row, day, v) => {
  row.total += v
  row.byDay[day] = (row.byDay[day] ?? 0) + v
}
const mkRow = (key, label, level, extra = {}) => ({ key, label, level, total: 0, byDay: {}, ...extra })

/**
 * @param month   'YYYY-MM'
 * @param txs     операции месяца (adesk_transactions + project_type, project_name)
 * @param R       prepareRules(...)
 * @param opening остаток всех счетов на начало месяца, ₸
 */
export function buildDds({ month, txs, R, opening = 0 }) {
  const days = daysOf(month)
  const list = txs
    .filter((t) => String(t.date).slice(0, 7) === month)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Number(a.id) - Number(b.id)))

  const inRows = {
    orders: mkRow('in:orders', 'Заказы (под заказ)', 2),
    stock: mkRow('in:stock', 'Из наличия', 2),
    other: mkRow('in:other', 'Прочие поступления', 2),
  }
  const cash = mkRow('in:cash', 'нал', 2)
  const bank = mkRow('in:bank', 'безнал', 2)
  const acquiring = mkRow('acquiring', 'эквайринг', 2)
  const refunds = mkRow('refunds', 'возвраты клиентам', 2)
  const fx = mkRow('fx', 'Курсовые разницы при переводах между счетами', 1)
  const excluded = mkRow('excluded', 'Исключено из учёта (статуэтка)', 1)
  const unassignedRow = mkRow('unassigned', 'Не распределено', 1, { items: [] })

  const fundRows = new Map()
  const itemRows = new Map()
  for (const f of R.funds) fundRows.set(f.id, mkRow(`fund:${f.key}`, f.name, 1, { fund: f, items: [] }))
  for (const i of [...R.items].sort((a, b) => a.sort - b.sort)) {
    const fr = fundRows.get(i.fund_id)
    if (!fr) continue
    const ir = mkRow(i.key, i.name, 2, { itemId: i.id, prior: 0, txs: [] })
    itemRows.set(i.id, ir)
    fr.items.push(ir)
  }

  const ctx = { okladUsed: new Map() }
  const unassigned = []
  const ops = []
  for (const t of list) {
    const c = classify(t, R, ctx)
    const day = String(t.date).slice(0, 10)
    const v = c.amount
    ops.push({ t, c })
    if (c.kind === 'excluded') add(excluded, day, Number(t.type) === 1 ? v : -v)
    else if (c.kind === 'transfer') add(fx, day, Number(t.type) === 1 ? v : -v)
    else if (c.kind === 'acquiring') add(acquiring, day, v)
    else if (c.kind === 'refund') add(refunds, day, v)
    else if (c.kind === 'income') {
      add(inRows[c.direction], day, v)
      if (c.money === 'cash') add(cash, day, v)
      else if (c.money === 'bank') add(bank, day, v)
    } else {
      for (const p of partsOf(c)) {
        const ir = p.itemId ? itemRows.get(p.itemId) : null
        if (ir) {
          add(ir, day, p.amount)
          add(fundRows.get(p.fundId), day, p.amount)
          if (c.priorMonth) ir.prior += p.amount
          ir.txs.push({ ...t, part: p.amount, priorMonth: c.priorMonth, person: c.person ?? null })
        } else {
          add(unassignedRow, day, p.amount)
          unassigned.push(t)
        }
      }
    }
  }

  const incomeGross = inRows.orders.total + inRows.stock.total + inRows.other.total
  const incomeNet = mkRow('income', 'ПОСТУПЛЕНИЯ (чистые)', 0)
  const payments = mkRow('payments', 'ПЛАТЕЖИ', 0)
  const net = mkRow('net', 'ЧИСТЫЙ ДЕНЕЖНЫЙ ПОТОК', 0)
  const open = mkRow('opening', 'Остаток на начало дня', 0)
  const close = mkRow('closing', 'Остаток на конец дня', 0)
  let bal = Number(opening)
  for (const day of days) {
    const inc = (inRows.orders.byDay[day] ?? 0) + (inRows.stock.byDay[day] ?? 0) + (inRows.other.byDay[day] ?? 0)
    const incN = inc - (acquiring.byDay[day] ?? 0) - (refunds.byDay[day] ?? 0)
    let pay = unassignedRow.byDay[day] ?? 0
    for (const fr of fundRows.values()) pay += fr.byDay[day] ?? 0
    add(incomeNet, day, incN)
    add(payments, day, pay)
    add(net, day, incN - pay)
    open.byDay[day] = Math.round(bal * 100) / 100
    bal += incN - pay + (fx.byDay[day] ?? 0) + (excluded.byDay[day] ?? 0)
    close.byDay[day] = Math.round(bal * 100) / 100
  }
  open.total = Number(opening)
  close.total = Math.round(bal * 100) / 100

  const pct = (v) => (incomeGross ? v / incomeGross : null)
  const rows = [
    open,
    incomeNet,
    inRows.orders,
    inRows.stock,
    inRows.other,
    cash,
    bank,
    acquiring,
    refunds,
    payments,
    ...fundRows.values(),
    unassignedRow,
    net,
    fx,
    excluded,
    close,
  ]
  for (const r of rows) {
    if (r.key !== 'opening' && r.key !== 'closing') r.pctOfIncome = pct(r.total)
    for (const i of r.items ?? []) i.pctOfIncome = pct(i.total)
  }

  return {
    month,
    days,
    rows,
    ops,
    unassigned,
    totals: {
      incomeGross,
      incomeNet: incomeNet.total,
      cash: cash.total,
      bank: bank.total,
      acquiring: acquiring.total,
      refunds: refunds.total,
      payments: payments.total,
      net: net.total,
      fx: fx.total,
      excluded: excluded.total,
      opening: Number(opening),
      closing: close.total,
    },
  }
}
