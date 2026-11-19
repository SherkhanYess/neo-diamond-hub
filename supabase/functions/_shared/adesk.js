// Adesk → хаб: чистые функции нормализации (сеть — в adesk-sync/index.ts).
// Суммы считаем в тенге по курсу самой операции Adesk (ТЗ: «долларовые операции —
// в тенге по курсу операции»).

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
const round2 = (v) => Math.round(v * 100) / 100

/** Сумма операции в тенге. */
export function amountKzt(t) {
  const a = num(t.amount) ?? 0
  if ((t.bankAccount?.currency ?? 'KZT') === 'KZT') return round2(a)
  const rate = num(t.exchangeRate) ?? num(t.bankAccount?.rate) ?? 1
  return round2(a * rate)
}

/** Вид счёта по названию: нал / безнал / фондовый / прочее. */
export function accountKind(name) {
  const n = String(name ?? '').toLowerCase()
  if (/налич/.test(n)) return 'cash'
  if (/kaspi|online bank/.test(n)) return 'bank'
  if (/фонд/.test(n)) return 'fund'
  return 'other'
}

/** Операция Adesk → строка adesk_transactions. */
export function txRow(t) {
  const cat = t.category ?? null
  return {
    id: t.id,
    date: t.dateIso,
    related_date: t.relatedDateIso ?? null,
    type: t.type,
    amount: num(t.amount) ?? 0,
    amount_kzt: amountKzt(t),
    account_id: t.bankAccount?.id ?? null,
    category_id: cat?.id ?? null,
    project_id: t.project?.id ?? null,
    is_transfer: t.isTransfer === true || /перевод между счетами/i.test(cat?.name ?? ''),
    transfer_id: t.transferId ?? null,
    paired_id: t.pairedTransactionId ?? null,
    description: t.description ?? null,
    contractor: t.contractor?.name ?? null,
  }
}

/** 'dd.mm.yyyy[ hh:mm]' → 'yyyy-mm-dd'. */
export function ruDate(v) {
  const m = String(v ?? '').match(/^(\d{2})\.(\d{2})\.(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** Сделка/проект Adesk → строка adesk_projects. */
export function projectRow(p) {
  return {
    id: p.id,
    type: p.type ?? null,
    name: p.name,
    category: p.category?.name ?? null,
    act_date: p.actDate ?? null,
    deal_amount: num(p.dealAmount),
    created: ruDate(p.created),
    archived: !!p.isArchived,
  }
}
