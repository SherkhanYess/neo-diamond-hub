// Операция Adesk → место в ДДС по фондам.
//
// Правила (fin_rules, fin_people) хранятся в базе и правятся в «Настройках → Привязка статей
// к фондам»; здесь только их применение. Порядок — от самого точного к общему:
//   1. исключённый проект (статуэтка) — нигде не считается;
//   2. перевод между счетами — не доход и не расход;
//   3. эквайринг («Комиссия за Pay») — вычитается из поступлений;
//   4. возврат клиенту — уменьшает поступления, в фондах не сидит;
//   5. поступление: направление по сделке Adesk (заказ / из наличия / прочее), нал или безнал по счёту;
//   6. выплата человеку (fin_people): до оклада месяца начисления — в оклады, сверх — в его фонд;
//   7. расход без статьи с указанного счёта;
//   8. статья + текст в описании;
//   9. статья;
//  10. иначе — «Не распределено» (itemId null): видно, не теряется.

/** Особые статьи Adesk (id): не строки фондов. */
export const SPECIAL = {
  acquiring: [583226], // «Комиссия за Pay»
  refund: [2071983, 1469483], // «Возврат денег клиенту (не расход)», «Возвраты клиентам»
}

const lc = (s) => String(s ?? '').toLowerCase()
const month = (d) => String(d ?? '').slice(0, 7)

/** Справочники из базы → удобные для поиска структуры. */
export function prepareRules({ funds = [], items = [], rules = [], people = [], accounts = [], special = SPECIAL }) {
  const itemById = new Map(items.map((i) => [i.id, i]))
  const sorted = [...rules].sort((a, b) => a.priority - b.priority)
  return {
    funds: [...funds].sort((a, b) => a.sort - b.sort),
    items,
    itemById,
    exclude: sorted.filter((r) => r.kind === 'exclude_project' && r.text_match).map((r) => lc(r.text_match)),
    noCategory: sorted.filter((r) => r.kind === 'account_no_category'),
    byText: sorted.filter((r) => r.kind === 'category_description'),
    byCategory: new Map(sorted.filter((r) => r.kind === 'category').map((r) => [Number(r.category_id), r.item_id])),
    people: people.filter((p) => p.active !== false),
    accountKind: new Map(accounts.map((a) => [Number(a.id), a.kind])),
    acquiring: new Set((special.acquiring ?? []).map(Number)),
    refund: new Set((special.refund ?? []).map(Number)),
  }
}

export const itemKeyOf = (R, itemId) => R.itemById.get(itemId)?.key ?? null
const fundOf = (R, itemId) => R.itemById.get(itemId)?.fund_id ?? null

function findPerson(R, t) {
  const cat = Number(t.category_id)
  const hay = `${lc(t.description)} ${lc(t.contractor)}`
  return R.people.find((p) => (p.categories ?? []).map(Number).includes(cat) && (p.match ?? []).some((m) => m && hay.includes(lc(m))))
}

/**
 * @param t   строка adesk_transactions (+ project_type, project_name)
 * @param R   prepareRules(...)
 * @param ctx { okladUsed: Map } — сколько оклада уже выплачено человеку за месяц начисления;
 *            операции нужно подавать по порядку дат.
 */
export function classify(t, R, ctx = { okladUsed: new Map() }) {
  const amount = Number(t.amount_kzt)
  const priorMonth = !!t.related_date && month(t.related_date) < month(t.date)
  const out = (o) => ({ direction: null, money: null, itemId: null, fundId: null, priorMonth, amount, ...o })

  const pname = lc(t.project_name)
  if (pname && R.exclude.some((x) => pname.includes(x))) return out({ kind: 'excluded' })
  if (t.is_transfer) return out({ kind: 'transfer' })
  const cat = t.category_id == null ? null : Number(t.category_id)
  if (cat != null && R.acquiring.has(cat)) return out({ kind: 'acquiring' })
  if (cat != null && R.refund.has(cat)) return out({ kind: 'refund' })

  if (Number(t.type) === 1) {
    const direction = t.project_type === 'deal' ? 'orders' : t.project_type === 'product_deal' ? 'stock' : 'other'
    const kind = R.accountKind.get(Number(t.account_id))
    const money = kind === 'cash' ? 'cash' : kind === 'bank' ? 'bank' : 'other'
    return out({ kind: 'income', direction, money })
  }

  const person = cat != null ? findPerson(R, t) : null
  if (person) {
    const key = `${person.id}|${month(t.related_date || t.date)}`
    const used = ctx.okladUsed.get(key) ?? 0
    const okladPart = person.overflow_item_id ? Math.min(Math.max(Number(person.oklad) - used, 0), amount) : amount
    ctx.okladUsed.set(key, used + okladPart)
    const split = []
    if (okladPart > 0) split.push({ itemId: person.item_id, fundId: fundOf(R, person.item_id), amount: okladPart })
    if (amount - okladPart > 0) split.push({ itemId: person.overflow_item_id, fundId: fundOf(R, person.overflow_item_id), amount: amount - okladPart })
    return out({ kind: 'expense', itemId: split[0].itemId, fundId: split[0].fundId, split, person: person.name })
  }

  if (cat == null) {
    const r = R.noCategory.find((x) => Number(x.account_id) === Number(t.account_id))
    if (r) return out({ kind: 'expense', itemId: r.item_id, fundId: fundOf(R, r.item_id) })
    return out({ kind: 'expense' })
  }
  const desc = lc(t.description)
  const byText = R.byText.find((x) => Number(x.category_id) === cat && x.text_match && desc.includes(lc(x.text_match)))
  if (byText) return out({ kind: 'expense', itemId: byText.item_id, fundId: fundOf(R, byText.item_id) })
  const itemId = R.byCategory.get(cat) ?? null
  return out({ kind: 'expense', itemId, fundId: fundOf(R, itemId) })
}

/** Части расхода: выплата человеку может делиться на оклад и «сверх оклада». */
export const partsOf = (c) => (c.split?.length ? c.split : [{ itemId: c.itemId, fundId: c.fundId, amount: c.amount }])
