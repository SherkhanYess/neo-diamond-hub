// Остаток всех счетов на начало месяца: опорный остаток из отчёта Adesk ± движение денег
// по операциям между датами (поступления плюс, платежи минус, переводы обеими ногами).
// Так считает и отчёт ДДС Adesk; текущие балансы счетов не годятся — валюта переоценивается.

export const monthStart = (month) => `${month}-01`
export function nextMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/**
 * @param month  'YYYY-MM'
 * @param anchor { date: 'YYYY-MM-DD', amount }
 * @param flow   async (from, to) → движение за [from, to)
 */
export async function openingFor(month, anchor, flow) {
  const start = monthStart(month)
  if (start === anchor.date) return Number(anchor.amount)
  if (start > anchor.date) return Number(anchor.amount) + Number(await flow(anchor.date, start))
  return Number(anchor.amount) - Number(await flow(start, anchor.date))
}
