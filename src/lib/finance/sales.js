// Продажи по Adesk (решение владельца 19.11.2026).
//   Заказ — сделка с четырёхзначным кодом; месяц продажи — месяц акта, без акта — месяц из
//   названия («8935 ноябрь»), иначе месяц создания. Выручка — сумма сделки.
//   Из наличия — поступления проектов «Товар под реализацию — …», склеенные в продажи;
//   продажа сверяется с закрытыми сделками amoCRM. Ошибка ±1–2 продажи допустима.
// Статуэтка и другие исключённые проекты не считаются (fin_rules exclude_project).

const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма[йя]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр']
const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`
const lc = (s) => String(s ?? '').toLowerCase()
const days = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000

/** Месяц продажи сделки Adesk 'YYYY-MM'. */
export function saleMonthOf(p) {
  if (p.act_date) return String(p.act_date).slice(0, 7)
  const created = p.created ? String(p.created) : null
  const idx = MONTHS.findIndex((re) => new RegExp(re, 'i').test(p.name ?? ''))
  if (idx >= 0 && created) {
    const cy = Number(created.slice(0, 4))
    const cm = Number(created.slice(5, 7))
    // Сделку «декабрь» могли завести в январе: месяц из названия не позже месяца создания + 1.
    const year = idx + 1 > cm + 1 ? cy - 1 : cy
    return ym(year, idx + 1)
  }
  return created ? created.slice(0, 7) : null
}

const excluded = (R, name) => R.exclude.some((x) => lc(name).includes(x))
const lastDay = (d) => {
  const [y, m] = String(d).split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate() === Number(String(d).slice(8, 10))
}

/**
 * Заказы месяца.
 * @param firstPay Map projectId → дата первой оплаты (для дня продажи, если акт — последний день месяца)
 */
export function ordersOf(month, projects, R, firstPay = new Map()) {
  return projects
    .filter((p) => p.type === 'deal' && /^\d{4}/.test(p.name ?? '') && !excluded(R, p.name) && saleMonthOf(p) === month)
    .map((p) => {
      const pay = firstPay.get(Number(p.id))
      const date = p.act_date && !lastDay(p.act_date) ? String(p.act_date) : pay ?? p.act_date ?? p.created
      return { id: Number(p.id), name: p.name, amount: Number(p.deal_amount) || 0, date: date ? String(date).slice(0, 10) : null }
    })
}

// Имена продавцов и общие слова не отличают изделия.
const STOP = new Set(['голд', 'жанар', 'жанара', 'жанары', 'акмарал', 'наргиза', 'наргизы', 'ержан', 'карат', 'кт', 'ct', 'за', 'от', 'на'])
function tokens(s) {
  return new Set(
    lc(s)
      .replace(/(\d)\s*(кт|ct|карат)/g, '$1 ')
      .split(/[^a-zа-яё0-9.,]+/i)
      .map((t) => t.replace(/[.,]$/, ''))
      .filter((t) => t && !STOP.has(t))
  )
}
const jaccard = (a, b) => {
  const inter = [...a].filter((x) => b.has(x)).length
  return inter / (a.size + b.size - inter || 1)
}

/**
 * Продажи из наличия за месяц: поступления проектов product_deal, склеенные в изделия.
 * Платёж присоединяется к продаже того же проекта в пределах 7 дней, если описание совпадает
 * (сходство ≥ 0,6) или это доплата (меньше 35 % продажи) с общим словом.
 * Возврат ≥ 80 % суммы продажи после неё отменяет продажу.
 */
export function stockSalesOf(month, txs, R) {
  const inMonth = txs.filter((t) => String(t.date).slice(0, 7) === month && t.project_type === 'product_deal' && !excluded(R, t.project_name))
  const pays = inMonth.filter((t) => Number(t.type) === 1 && !t.is_transfer).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const sales = []
  for (const t of pays) {
    const amount = Number(t.amount_kzt)
    const tk = tokens(t.description)
    const hit = sales.find((s) => {
      if (s.projectId !== t.project_id || days(s.lastDate, t.date) > 7) return false
      // Доплата — общее слово (модель, форма), одной цифры мало: «1» есть у половины изделий.
      const overlap = [...tk].some((x) => /[a-zа-яё]/i.test(x) && s.tokens.has(x))
      const small = Math.min(amount, s.amount) < 0.35 * Math.max(amount, s.amount)
      return jaccard(tk, s.tokens) >= 0.6 || (small && overlap) || (!tk.size && small)
    })
    if (hit) {
      hit.amount += amount
      hit.lastDate = t.date
      hit.txIds.push(t.id)
      for (const x of tk) hit.tokens.add(x)
    } else {
      sales.push({ projectId: t.project_id, project: t.project_name, date: String(t.date).slice(0, 10), lastDate: t.date, amount, description: t.description, tokens: tk, txIds: [t.id], cancelled: false })
    }
  }
  const refunds = inMonth.filter((t) => Number(t.type) === 2 && R.refund.has(Number(t.category_id)))
  for (const r of refunds) {
    const v = Number(r.amount_kzt)
    const cand = sales
      .filter((s) => !s.cancelled && s.projectId === r.project_id && s.date <= r.date && v >= 0.8 * s.amount)
      .sort((a, b) => Math.abs(a.amount - v) - Math.abs(b.amount - v))[0]
    if (cand) cand.cancelled = true
  }
  return sales.map(({ tokens: _t, lastDate: _l, ...s }) => s)
}

/** Сверка продаж с закрытыми сделками amoCRM: выручка ±5 %, дата ±10 дней. */
export function confirmWithAmo(sales, amoDeals) {
  const used = new Set()
  return sales.map((s) => {
    const i = amoDeals.findIndex((d, k) => !used.has(k) && d.revenue && Math.abs(Number(d.revenue) - s.amount) <= 0.05 * s.amount && days(d.sale_at, s.date) <= 10)
    if (i >= 0) used.add(i)
    return { ...s, confirmed: i >= 0 }
  })
}

/** Итог продаж месяца по Adesk. */
export function salesOf(month, { projects, txs, R, amo = [] }) {
  const firstPay = new Map()
  for (const t of [...txs].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (Number(t.type) === 1 && t.project_id && !firstPay.has(Number(t.project_id))) firstPay.set(Number(t.project_id), String(t.date).slice(0, 10))
  }
  const orders = ordersOf(month, projects, R, firstPay)
  const stock = confirmWithAmo(stockSalesOf(month, txs, R), amo)
  const live = stock.filter((s) => !s.cancelled)
  const revenue = orders.reduce((a, o) => a + o.amount, 0) + live.reduce((a, s) => a + s.amount, 0)
  const count = orders.length + live.length
  return { month, orders, stock, count, revenue, avgCheck: count ? revenue / count : 0, confirmed: live.filter((s) => s.confirmed).length }
}
