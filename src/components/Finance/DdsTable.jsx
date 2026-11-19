import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { partsOf } from '../../lib/finance/classify'
import { weekdayOf } from '../../lib/finance/dds'
import { money } from '../../lib/format'

const n0 = (v) => (v ? Math.round(v).toLocaleString('ru-RU').replace(/,/g, ' ') : '')
const pct = (v) => (v == null || !isFinite(v) || Math.abs(v) < 0.0005 ? '' : `${(v * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`)

/** Какие операции дали строку: по ключу строки и (необязательно) дню. */
function opsFor(dds, row, day) {
  const onDay = ({ t }) => !day || String(t.date).slice(0, 10) === day
  const pick = (fn) =>
    dds.ops.filter(onDay).flatMap(({ t, c }) => {
      const parts = fn(c)
      return parts ? [{ t, c, amount: parts }] : []
    })
  const k = row.key
  if (row.itemId) return pick((c) => partsOf(c).filter((p) => p.itemId === row.itemId).reduce((a, p) => a + p.amount, 0) || null)
  if (k.startsWith('fund:')) return pick((c) => partsOf(c).filter((p) => p.fundId === row.fund.id).reduce((a, p) => a + p.amount, 0) || null)
  if (k === 'unassigned') return pick((c) => (c.kind === 'expense' ? partsOf(c).filter((p) => !p.itemId).reduce((a, p) => a + p.amount, 0) || null : null))
  const by = {
    'in:orders': (c) => c.kind === 'income' && c.direction === 'orders',
    'in:stock': (c) => c.kind === 'income' && c.direction === 'stock',
    'in:other': (c) => c.kind === 'income' && c.direction === 'other',
    'in:cash': (c) => c.kind === 'income' && c.money === 'cash',
    'in:bank': (c) => c.kind === 'income' && c.money === 'bank',
    acquiring: (c) => c.kind === 'acquiring',
    refunds: (c) => c.kind === 'refund',
    fx: (c) => c.kind === 'transfer',
    excluded: (c) => c.kind === 'excluded',
    paired: (c) => c.kind === 'paired',
  }[k]
  return by ? pick((c) => (by(c) ? c.amount : null)) : []
}

const DRILL = new Set(['in:orders', 'in:stock', 'in:other', 'in:cash', 'in:bank', 'acquiring', 'refunds', 'fx', 'paired', 'excluded', 'unassigned'])

export default function DdsTable({ dds, refs }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(() => new Set())
  const [drill, setDrill] = useState(null)
  const accounts = useMemo(() => new Map(refs.raw.accounts.map((a) => [Number(a.id), a.name])), [refs])
  const categories = useMemo(() => new Map(refs.raw.categories.map((c) => [Number(c.id), c.name])), [refs])
  const T = dds.totals
  const toggle = (k) => setOpen((s) => {
    const n = new Set(s)
    n.has(k) ? n.delete(k) : n.add(k)
    return n
  })

  const rows = []
  for (const r of dds.rows) {
    rows.push(r)
    if (r.key.startsWith('fund:') && open.has(r.key)) rows.push(...r.items.filter((i) => i.total))
  }
  const canDrill = (r) => r.itemId || r.key.startsWith('fund:') || DRILL.has(r.key)
  const priorOnDay = (r, day) => r.txs?.some((t) => t.priorMonth && String(t.date).slice(0, 10) === day)

  const drillOps = drill ? opsFor(dds, drill.row, drill.day) : []

  return (
    <>
      <div className="fin__cards">
        <Card label="Остаток на начало" value={T.opening} />
        <Card label="Поступления (чистые)" value={T.incomeNet} hint={`нал ${money(T.cash)} · безнал ${money(T.bank)}`} />
        <Card label="Платежи" value={T.payments} />
        <Card label="Чистый поток" value={T.net} tone={T.net < 0 ? 'bad' : 'good'} />
        <Card label="Остаток на конец" value={T.closing} />
      </div>

      {dds.unassigned.length > 0 && (
        <div className="fin__warn">
          Не распределено {dds.unassigned.length} операций на {money(dds.rows.find((r) => r.key === 'unassigned').total)} —
          <button onClick={() => navigate('/settings#fin_rules')}>привязать статьи к фондам</button>
        </div>
      )}

      <div className="fin__scroll">
        <table className="dds">
          <thead>
            <tr>
              <th className="dds__name">Статья</th>
              <th className="dds__num">Итог месяца</th>
              <th className="dds__pct">% от поступлений</th>
              {dds.days.map((d) => (
                <th key={d} className={`dds__day ${['сб', 'вс'].includes(weekdayOf(d)) ? 'is-weekend' : ''}`}>
                  {Number(d.slice(8))}
                  <small>{weekdayOf(d)}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isFund = r.key.startsWith('fund:')
              const balance = r.key === 'opening' || r.key === 'closing'
              const cls = `dds__row dds__row--l${r.level} ${isFund ? 'dds__row--fund' : ''} ${r.key === 'unassigned' && r.total ? 'dds__row--warn' : ''} ${balance ? 'dds__row--bal' : ''}`
              return (
                <tr key={r.key} className={cls}>
                  <td className="dds__name">
                    {isFund && r.items.some((i) => i.total) ? (
                      <button className="dds__toggle" onClick={() => toggle(r.key)}>
                        <span>{open.has(r.key) ? '▾' : '▸'}</span> {r.label}
                      </button>
                    ) : (
                      r.label
                    )}
                    {r.prior > 0 && <span className="dds__prior" title={`В т.ч. за прошлый месяц: ${money(r.prior)}`}>•</span>}
                  </td>
                  <td className={`dds__num ${canDrill(r) && r.total ? 'is-click' : ''}`} onClick={() => canDrill(r) && r.total && setDrill({ row: r, day: null })}>
                    {balance ? n0(r.total) || '0' : n0(r.total)}
                  </td>
                  <td className="dds__pct">{pct(r.pctOfIncome)}</td>
                  {dds.days.map((d) => {
                    const v = r.byDay[d]
                    const click = canDrill(r) && v
                    return (
                      <td key={d} className={`dds__day ${click ? 'is-click' : ''}`} onClick={() => click && setDrill({ row: r, day: d })}>
                        {balance ? n0(v) : n0(v)}
                        {priorOnDay(r, d) && <span className="dds__prior" title="Платёж за прошлый месяц">•</span>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="fin__legend">
        <span className="dds__prior">•</span> платёж за прошлый месяц (по дате начисления в Adesk) — не перерасход текущего месяца. Клик по сумме — операции.
      </p>

      {drill && (
        <div className="fin__drawer" role="dialog" onClick={() => setDrill(null)}>
          <div className="fin__sheet" onClick={(e) => e.stopPropagation()}>
            <div className="fin__sheet-head">
              <b>{drill.row.label}</b>
              <span>{drill.day ? new Date(`${drill.day}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : 'весь месяц'}</span>
              <button onClick={() => setDrill(null)} aria-label="Закрыть">×</button>
            </div>
            <table className="fin__ops">
              <tbody>
                {drillOps.map(({ t, c, amount }, i) => (
                  <tr key={`${t.id}-${i}`}>
                    <td>{String(t.date).slice(8, 10)}.{String(t.date).slice(5, 7)}</td>
                    <td>
                      {categories.get(Number(t.category_id)) ?? 'без статьи'}
                      <small>
                        {[accounts.get(Number(t.account_id)), t.project_name, t.description, t.contractor, c.person && `→ ${c.person}`, c.priorMonth && 'за прошлый месяц']
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </td>
                    <td className="fin__ops-sum">{money(amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

function Card({ label, value, hint, tone }) {
  return (
    <div className={`fin__card ${tone ? `fin__card--${tone}` : ''}`}>
      <span>{label}</span>
      <b>{money(value)}</b>
      {hint && <small>{hint}</small>}
    </div>
  )
}
