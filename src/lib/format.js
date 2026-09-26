// Display formatting per brandbook: ₸ with thin spaces, one-decimal percents.

export function money(n, currency = '₸') {
  const v = Math.round(Number(n) || 0)
  return v.toLocaleString('ru-RU').replace(/,/g, ' ') + ' ' + currency
}

export function num1(n) {
  return (Number(n) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export function pct1(n) {
  return num1(n) + '%'
}

export function ratio1(n) {
  return num1(n)
}
