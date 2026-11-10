// Период отчётов: с какого по какое число (включительно), а не месяц.
//
// Факт (сделки, расходы) берётся за период. Планы месячные: для периода план
// месяца берётся пропорционально числу дней периода в этом месяце (1–15 ноября
// = половина ноябрьского плана), периоды через границу месяца складываются.

const pad = (n) => String(n).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
const addDays = (s, n) => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()

export const PRESETS = [
  { key: 'today', label: 'Сегодня' },
  { key: 'yesterday', label: 'Вчера' },
  { key: 'last7', label: '7 дней' },
  { key: 'last30', label: '30 дней' },
  { key: 'thisMonth', label: 'Этот месяц' },
  { key: 'lastMonth', label: 'Прошлый месяц' },
]

/** Период месяца: '2026-11-01' → 1–30 ноября. */
export function monthPeriod(month) {
  const d = parse(month)
  const y = d.getFullYear()
  const m = d.getMonth()
  return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m, daysInMonth(y, m))) }
}

export function presetPeriod(key, now = new Date()) {
  const today = ymd(now)
  switch (key) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const y = addDays(today, -1)
      return { from: y, to: y }
    }
    case 'last7':
      return { from: addDays(today, -6), to: today }
    case 'last30':
      return { from: addDays(today, -29), to: today }
    case 'lastMonth':
      return monthPeriod(ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)))
    case 'thisMonth':
    default:
      return monthPeriod(ymd(new Date(now.getFullYear(), now.getMonth(), 1)))
  }
}

/** Какой пресет совпадает с периодом (для подсветки кнопки), иначе null. */
export function presetOf(p, now = new Date()) {
  return PRESETS.find((x) => {
    const q = presetPeriod(x.key, now)
    return q.from === p.from && q.to === p.to
  })?.key ?? null
}

export function normalize(p) {
  if (!p?.from || !p?.to) return presetPeriod('thisMonth')
  return p.from <= p.to ? { from: p.from, to: p.to } : { from: p.to, to: p.from }
}

/** Все дни периода. week — номер 7-дневной недели от начала периода (с 1). */
export function periodDays(p) {
  const out = []
  for (let k = p.from, i = 0; k <= p.to; k = addDays(k, 1), i++) {
    const date = parse(k)
    out.push({ key: k, date, day: date.getDate(), week: Math.floor(i / 7) + 1 })
  }
  return out
}

export const periodLength = (p) => periodDays(p).length

/** Границы для запроса: [start, end) — end = следующий день после «по». */
export function periodBounds(p) {
  return { start: p.from, end: addDays(p.to, 1) }
}

/** Месяцы периода с долей плана: [{ month: 'YYYY-MM-01', factor }]. */
export function periodMonths(p) {
  const byMonth = new Map()
  for (const d of periodDays(p)) {
    const month = `${d.key.slice(0, 7)}-01`
    byMonth.set(month, (byMonth.get(month) || 0) + 1)
  }
  return [...byMonth].map(([month, days]) => {
    const m = parse(month)
    return { month, days, factor: days / daysInMonth(m.getFullYear(), m.getMonth()) }
  })
}

/** Доля прошедшего периода на сегодня: 1 — период прошёл, 0 — ещё не начался. */
export function periodPace(p, now = new Date()) {
  const today = ymd(now)
  if (today > p.to) return 1
  if (today < p.from) return 0
  const all = periodLength(p)
  const passed = periodLength({ from: p.from, to: today })
  return Math.min(1, passed / all)
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
export function periodLabel(p) {
  const a = parse(p.from)
  const b = parse(p.to)
  if (p.from === p.to) return `${a.getDate()} ${MONTHS[a.getMonth()]}`
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
    return `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
  return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`
}

// Слагаемые поля снимка плана: их план делится по дням, доли и средние — нет.
const ADDITIVE = ['revenue', 'orders', 'ad_budget', 'target_revenue']
const scaleRow = (r, f) => {
  const out = { ...r }
  for (const k of ADDITIVE) if (typeof out[k] === 'number') out[k] = out[k] * f
  return out
}

/** План месяца, умноженный на долю периода в этом месяце. */
export function scalePlan(plan, factor) {
  if (factor === 1 || !plan?.computed) return plan
  const c = plan.computed
  return {
    ...plan,
    computed: {
      ...c,
      rows: (c.rows || []).map((r) => scaleRow(r, factor)),
      taskTotals: (c.taskTotals || []).map((r) => scaleRow(r, factor)),
      sourceTotals: (c.sourceTotals || []).map((r) => scaleRow(r, factor)),
      grandTotal: c.grandTotal ? scaleRow(c.grandTotal, factor) : c.grandTotal,
      ...(c.stageCounts ? { stageCounts: Object.fromEntries(Object.entries(c.stageCounts).map(([k, v]) => [k, Number(v) * factor])) } : {}),
    },
    factor,
  }
}
