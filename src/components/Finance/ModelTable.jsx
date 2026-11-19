import { useState } from 'react'
import { money } from '../../lib/format'

const nf = (v, d = 0) => (Number.isFinite(v) ? Number(v).toLocaleString('ru-RU', { maximumFractionDigits: d }).replace(/,/g, ' ') : '')
const pc = (v) => (Number.isFinite(v) && v ? `${(v * 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%` : '')
const parse = (s) => {
  const v = Number(String(s).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : 0
}

/** Поле ввода числа: показывает с пробелами, сохраняет при уходе из поля. */
function Num({ value, onSave, suffix, decimals = 0, width = 120 }) {
  const [draft, setDraft] = useState(null)
  const shown = draft ?? nf(Number(value) || 0, decimals)
  return (
    <span className="fm__in" style={{ width }}>
      <input
        inputMode="decimal"
        value={shown}
        onFocus={(e) => {
          setDraft(String(value ?? 0))
          requestAnimationFrame(() => e.target.select())
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = parse(draft)
          setDraft(null)
          if (v !== Number(value)) onSave(v)
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {suffix && <em>{suffix}</em>}
    </span>
  )
}

const MODES = (fund) => [
  { key: 'pct', label: fund.block === 'management' ? '% маржи' : '% выручки' },
  ...(fund.per_sale ? [{ key: 'per_sale', label: '₸ на продажу' }] : []),
  { key: 'amount', label: '₸ в месяц' },
]

/**
 * Финмодель месяца. Вводные — поля (выделены), остальное считается.
 * prevFact: Map ключ фонда/строки → факт прошлого месяца на одну продажу (фонды per_sale).
 */
export default function ModelTable({ model, m, onSave, prevFact, prevLabel, planning, sales }) {
  const [open, setOpen] = useState(() => new Set(['salaries', 'rent', 'other', 'utilities']))
  const toggle = (k) => setOpen((s) => {
    const x = new Set(s)
    x.has(k) ? x.delete(k) : x.add(k)
    return x
  })
  const setFund = (key, patch) => onSave({ funds: { ...model.funds, [key]: { ...(model.funds?.[key] ?? { mode: 'pct', value: 0 }), ...patch } } })
  const setItem = (key, v) => onSave({ items: { ...model.items, [key]: v } })

  const fundInput = (r) => {
    if (r.byItems) return <span className="fm__muted">сумма строк</span>
    const input = r.input ?? { mode: 'pct', value: 0 }
    return (
      <span className="fm__mode">
        <Num
          value={input.value}
          decimals={input.mode === 'pct' ? 2 : 0}
          width={input.mode === 'pct' ? 80 : 120}
          onSave={(v) => setFund(r.key, { value: v })}
        />
        <select value={input.mode} onChange={(e) => setFund(r.key, { mode: e.target.value, value: e.target.value === input.mode ? input.value : convert(r, input.mode, e.target.value, m) })}>
          {MODES(r.fund).map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </select>
      </span>
    )
  }

  const diff = planning != null ? m.revenue - planning : null

  return (
    <>
      <div className="fin__cards">
        <div className="fin__card fm__rev">
          <span>Выручка, план месяца</span>
          <Num value={model.revenue} width={170} onSave={(v) => onSave({ revenue: v })} suffix="₸" />
          <small>
            {planning != null ? `В «Планировании»: ${money(planning)} · расхождение ${diff > 0 ? '+' : ''}${money(diff)}` : 'В «Планировании» утверждённого плана выручки на месяц нет'}
          </small>
        </div>
        <div className="fin__card fm__rev">
          <span>Средний чек</span>
          <Num value={model.avg_check} width={140} onSave={(v) => onSave({ avg_check: v })} suffix="₸" />
          <small>Продаж по плану: {nf(m.sales, 1)}</small>
        </div>
        <div className="fin__card">
          <span>Маржа</span>
          <b>{money(m.margin)}</b>
          <small>{pc(m.marginPct)} выручки</small>
        </div>
        <div className="fin__card">
          <span>Остаток</span>
          <b className={m.rest < 0 ? 'fm__neg' : ''}>{money(m.rest)}</b>
          <small>маржа − управление − постоянные</small>
        </div>
        {sales && (
          <div className="fin__card">
            <span>Факт продаж месяца (Adesk)</span>
            <b>{nf(sales.count)}</b>
            <small>
              заказов {sales.orders.length} · из наличия {sales.stock.filter((s) => !s.cancelled).length}
              {sales.confirmed ? ` (в amoCRM найдено ${sales.confirmed})` : ''} · чек {money(sales.avgCheck)}
            </small>
          </div>
        )}
      </div>

      <div className="fin__scroll">
        <table className="dds fm">
          <thead>
            <tr>
              <th className="dds__name">Фонд</th>
              <th>Ввод</th>
              <th>Итого сумма</th>
              <th>В процентах</th>
              <th>На единицу продажи</th>
              <th title="Оплачено по ДДС прошлого месяца ÷ продажи прошлого месяца (Adesk)">Факт {prevLabel} на продажу</th>
            </tr>
          </thead>
          <tbody>
            <tr className="dds__row dds__row--l0 fm__hl">
              <td className="dds__name">ВЫРУЧКА</td>
              <td />
              <td className="dds__num">{nf(m.revenue)}</td>
              <td>100%</td>
              <td>{nf(m.avgCheck)}</td>
              <td />
            </tr>
            {m.blocks.map((b) => (
              <BlockRows key={b.key} b={b} m={m} open={open} toggle={toggle} fundInput={fundInput} setItem={setItem} prevFact={prevFact} model={model} onSave={onSave} />
            ))}
            <tr className="dds__row dds__row--l0 fm__hl">
              <td className="dds__name">ОСТАТОК</td>
              <td />
              <td className={`dds__num ${m.rest < 0 ? 'fm__neg' : ''}`}>{nf(m.rest)}</td>
              <td>{pc(m.restPct)}</td>
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="fin__legend">
        Поля — вводные месяца, остальное считается. Фонд можно задать в % (от выручки или маржи), в ₸ в месяц или в ₸ на продажу (сдельная ЗП,
        закупки, транспорт). Новый месяц создаётся копией прошлого — старые не меняются.
      </p>
    </>
  )
}

function BlockRows({ b, m, open, toggle, fundInput, setItem, prevFact, model, onSave }) {
  return (
    <>
      <tr className="dds__row dds__row--l0">
        <td className="dds__name">{b.label}</td>
        <td />
        <td className="dds__num">{nf(b.total)}</td>
        <td>{pc(b.pct)}{b.key === 'management' ? ' маржи' : ''}</td>
        <td />
        <td />
      </tr>
      {b.rows.map((r) => (
        <FundRows key={r.key} r={r} open={open} toggle={toggle} fundInput={fundInput} setItem={setItem} prevFact={prevFact} model={model} onSave={onSave} />
      ))}
      {b.key === 'variable' && (
        <tr className="dds__row dds__row--l0 fm__hl">
          <td className="dds__name">МАРЖА</td>
          <td />
          <td className="dds__num">{nf(m.margin)}</td>
          <td>{pc(m.marginPct)}</td>
          <td>{nf(m.sales ? m.margin / m.sales : 0)}</td>
          <td />
        </tr>
      )}
    </>
  )
}

function FundRows({ r, open, toggle, fundInput, setItem, prevFact, model, onSave }) {
  const fact = prevFact?.get(r.key)
  return (
    <>
      <tr className="dds__row dds__row--fund">
        <td className="dds__name">
          {r.byItems ? (
            <button className="dds__toggle" onClick={() => toggle(r.key)}>
              <span>{open.has(r.key) ? '▾' : '▸'}</span> {r.name}
            </button>
          ) : (
            r.name
          )}
        </td>
        <td>{fundInput(r)}</td>
        <td className="dds__num">{nf(r.sum)}</td>
        <td>{pc(r.pct)}</td>
        <td>{r.perSale != null ? nf(r.perSale) : ''}</td>
        <td>{r.perSale != null && fact != null ? nf(fact) : ''}</td>
      </tr>
      {r.key === 'dividends' && (
        <tr className="dds__row dds__row--l2">
          <td className="dds__name">в т.ч. благотворительность</td>
          <td>
            <span className="fm__mode">
              <Num value={model.charity_pct} decimals={2} width={80} onSave={(v) => onSave({ charity_pct: v })} />
              <span className="fm__muted">% от дивидендов</span>
            </span>
          </td>
          <td className="dds__num">{nf(r.charity)}</td>
          <td />
          <td />
          <td />
        </tr>
      )}
      {r.byItems &&
        open.has(r.key) &&
        r.items.map((i) => (
          <tr key={i.key} className="dds__row dds__row--l2">
            <td className="dds__name">{i.name}</td>
            <td>
              <Num value={i.sum} onSave={(v) => setItem(i.key, v)} suffix="₸" />
            </td>
            <td>{nf(i.sum)}</td>
            <td />
            <td />
            <td>{r.fund.per_sale && prevFact?.get(i.key) != null ? nf(prevFact.get(i.key)) : ''}</td>
          </tr>
        ))}
    </>
  )
}

/** Перевод значения фонда при смене режима, чтобы сумма не прыгала. */
function convert(r, from, to, m) {
  const base = r.block === 'management' ? m.margin : m.revenue
  const sum = r.dividends ?? r.sum
  if (to === 'pct') return base ? Math.round((sum / base) * 10000) / 100 : 0
  if (to === 'per_sale') return m.sales ? Math.round(sum / m.sales) : 0
  return Math.round(sum)
}
