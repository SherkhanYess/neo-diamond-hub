// Цикл сделки: от первого обращения (создание сделки) до продажи, в днях.
//
// Считается по продажам, закрытым в выбранном периоде, а не по лидам периода:
// у свежих лидов долгие сделки ещё не закрыты, и цикл вышел бы заниженным.
// Показываем среднее и медиану — одна сделка длиной в полгода сильно тянет
// среднее, медиана показывает типичную сделку.
import { UNKNOWN } from './metrics'

const DAY = 86400000

export function cycleDays(deal) {
  if (!deal.sale_at || !deal.created_at) return null
  const d = (new Date(deal.sale_at) - new Date(deal.created_at)) / DAY
  return d >= 0 ? d : null
}

export function cycleStats(deals) {
  const days = deals.map(cycleDays).filter((d) => d != null).sort((a, b) => a - b)
  if (!days.length) return { n: 0, avg: null, median: null }
  const m = Math.floor(days.length / 2)
  return {
    n: days.length,
    avg: days.reduce((a, b) => a + b, 0) / days.length,
    median: days.length % 2 ? days[m] : (days[m - 1] + days[m]) / 2,
  }
}

/** Цикл по группам: keyOf(deal) → id группы (null → «не определено»). */
export function cycleBy(deals, keyOf) {
  const groups = new Map()
  for (const d of deals) {
    const k = keyOf(d) ?? UNKNOWN
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(d)
  }
  return [...groups.entries()]
    .map(([key, ds]) => ({ key, ...cycleStats(ds) }))
    .filter((g) => g.n > 0)
    .sort((a, b) => b.n - a.n)
}
