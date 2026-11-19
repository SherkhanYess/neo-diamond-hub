// Финмодель месяца: вводные → суммы фондов, % и «на одну продажу».
//
// Вход фонда — одно из (fin_models.funds[key]):
//   pct      — % от выручки (прямые переменные) или от маржи (расходы управления);
//   amount   — ₸ в месяц;
//   per_sale — ₸ на одну продажу (только фонды с признаком per_sale).
// Остальные значения выводятся. Постоянные фонды со строками = сумма строк (fin_models.items).
// Итоги блоков — только формулами (в старой таблице итоги расходились со строками).

const BLOCKS = [
  { key: 'variable', label: 'Прямые переменные затраты' },
  { key: 'management', label: 'Расходы управления' },
  { key: 'fixed', label: 'Условно-постоянные расходы' },
]

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const div = (a, b) => (b ? a / b : 0)

/**
 * @param model fin_models (revenue, avg_check, funds, items, charity_pct)
 * @param R     prepareRules(...) — фонды и строки
 */
export function computeModel(model, R) {
  const revenue = n(model.revenue)
  const avgCheck = n(model.avg_check)
  const sales = div(revenue, avgCheck)
  const inputs = model.funds ?? {}
  const amounts = model.items ?? {}
  const itemsOf = (fund) => R.items.filter((i) => i.fund_id === fund.id).sort((a, b) => a.sort - b.sort)

  const rowFor = (fund, base) => {
    const input = inputs[fund.key] ?? null
    const items = itemsOf(fund)
    const itemRows = items.map((i) => ({ key: i.key, name: i.name, sum: n(amounts[i.key]), input: amounts[i.key] ?? null }))
    const byItems = fund.block === 'fixed' && (itemRows.some((i) => i.input != null) || !input)
    let sum
    if (byItems) sum = itemRows.reduce((a, i) => a + i.sum, 0)
    else if (!input) sum = 0
    else if (input.mode === 'pct') sum = (base * n(input.value)) / 100
    else if (input.mode === 'per_sale') sum = n(input.value) * sales
    else sum = n(input.value)
    const row = {
      fund,
      key: fund.key,
      name: fund.name,
      block: fund.block,
      input: byItems ? null : input,
      byItems,
      sum,
      pct: div(sum, base),
      perSale: fund.per_sale ? div(sum, sales) : null,
      items: byItems ? itemRows : [],
    }
    if (fund.key === 'dividends') {
      // Благотворительность — из дивидендов (решение владельца 19.11): фонд = сумма дивидендов,
      // «в т.ч. благотворительность» — % от неё, на руки — остальное.
      row.dividends = sum
      row.charity = (sum * n(model.charity_pct)) / 100
      row.payout = sum - row.charity
    }
    return row
  }

  const funds = R.funds
  const variable = funds.filter((f) => f.block === 'variable').map((f) => rowFor(f, revenue))
  const variableTotal = variable.reduce((a, r) => a + r.sum, 0)
  const margin = revenue - variableTotal
  const management = funds.filter((f) => f.block === 'management').map((f) => rowFor(f, margin))
  const fixed = funds.filter((f) => f.block === 'fixed').map((f) => rowFor(f, revenue))
  // У постоянных % — от выручки (так в модели); у управления — от маржи.
  const rows = { variable, management, fixed }
  const blocks = BLOCKS.map((b) => {
    const total = rows[b.key].reduce((a, r) => a + r.sum, 0)
    return { ...b, rows: rows[b.key], total, pct: div(total, b.key === 'management' ? margin : revenue) }
  })
  const managementTotal = blocks[1].total
  const fixedTotal = blocks[2].total

  const need = requiredRevenue(model, R)
  return {
    month: model.month,
    requiredRevenue: need?.revenue ?? null,
    requiredSales: need?.sales ?? null,
    revenue,
    avgCheck,
    sales,
    margin,
    marginPct: div(margin, revenue),
    blocks,
    rest: margin - managementTotal - fixedTotal,
    restPct: div(margin - managementTotal - fixedTotal, revenue),
  }
}

/**
 * От дивидендов: какая выручка нужна, чтобы при этих вводных покрыть все фонды
 * (дивиденды и развитие — суммами, уровень необходимости владельца) и выйти в остаток 0.
 * Переменные пропорциональны выручке (% и ₸ на продажу при неизменном чеке), фонды
 * управления в % — пропорциональны марже, суммы — постоянны. null — решения нет.
 */
export function requiredRevenue(model, R) {
  const inputs = model.funds ?? {}
  const amounts = model.items ?? {}
  const check = n(model.avg_check)
  let varRatio = 0
  let varConst = 0
  let mgmtPct = 0
  let mgmtConst = 0
  let fixedConst = 0
  for (const f of R.funds) {
    const input = inputs[f.key]
    const items = R.items.filter((i) => i.fund_id === f.id)
    const byItems = f.block === 'fixed' && (items.some((i) => amounts[i.key] != null) || !input)
    if (byItems) {
      fixedConst += items.reduce((a, i) => a + n(amounts[i.key]), 0)
      continue
    }
    if (!input) continue
    const v = n(input.value)
    if (f.block === 'variable') {
      if (input.mode === 'pct') varRatio += v / 100
      else if (input.mode === 'per_sale') varRatio += check ? v / check : 0
      else varConst += v
    } else if (f.block === 'management') {
      if (input.mode === 'pct') mgmtPct += v / 100
      else mgmtConst += v
    } else if (input.mode === 'pct') varRatio += v / 100
    else fixedConst += v
  }
  if (varRatio >= 1 || mgmtPct >= 1) return null
  const margin = (mgmtConst + fixedConst) / (1 - mgmtPct)
  const revenue = (margin + varConst) / (1 - varRatio)
  return { revenue, margin, sales: check ? revenue / check : 0 }
}

/** Строка фонда по ключу. */
export const fundRow = (m, key) => m.blocks.flatMap((b) => b.rows).find((r) => r.key === key)

/** План строки фонда (ключ строки → сумма): оклады людей для разнесения ДДС. */
export function itemPlan(model) {
  return new Map(Object.entries(model.items ?? {}).map(([k, v]) => [k, n(v)]))
}

/** Модель нового месяца: независимая копия вводных прошлой. */
export function copyModel(prev, month) {
  return {
    month,
    revenue: n(prev.revenue),
    avg_check: n(prev.avg_check),
    charity_pct: n(prev.charity_pct),
    funds: JSON.parse(JSON.stringify(prev.funds ?? {})),
    items: JSON.parse(JSON.stringify(prev.items ?? {})),
  }
}
