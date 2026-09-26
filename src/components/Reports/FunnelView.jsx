import { useState } from 'react'
import { buildFunnel, filterActive } from '../../lib/reports/buildReport'
import { money, num1, pct1, ratio1 } from '../../lib/format'
import './Reports.css'

const na = (v, render) => (v == null ? <span className="rep__na">н/д</span> : render(v))

const FUNNEL_COLS = [
  { key: 'plan', label: 'План', render: (r) => na(r.plan, (v) => num1(v)) },
  { key: 'fact', label: 'Факт', render: (r) => na(r.fact, (v) => num1(v)) },
  { key: 'done', label: '% вып.', render: (r) => na(r.done_pct, (v) => pct1(v)) },
  { key: 'conv', label: 'Конверсия (факт)', render: (r) => na(r.fact_conv, (v) => pct1(v * 100)) },
  { key: 'cost', label: 'Стоимость этапа', render: () => <span className="rep__na">н/д</span> },
]

export default function FunnelView({ cohort, plan, orderedStages, meetHeldOrder, filters }) {
  const [hidden, setHidden] = useState([])
  const [pickOpen, setPickOpen] = useState(false)
  const { rows, totals, dealCycle, planTotals } = buildFunnel({
    deals: cohort.deals,
    events: cohort.events,
    plan,
    orderedStages,
    filters,
    meetHeldOrder,
  })
  const cols = FUNNEL_COLS.filter((c) => !hidden.includes(c.key))

  return (
    <div>
      {filterActive(filters.demand_source_id) && (
        <p className="rep__note">
          Эффект источников спроса оценивается по сделкам, дошедшим до встречи (там становится
          известно первое касание).
        </p>
      )}
      <div className="mx__toolbar">
        <div className="colpick mx__view-btn">
          <button className="btn btn--ghost" onClick={() => setPickOpen((o) => !o)}>
            Столбцы
          </button>
          {pickOpen && (
            <div className="colpick__menu" onMouseLeave={() => setPickOpen(false)}>
              {FUNNEL_COLS.map((c) => (
                <label key={c.key}>
                  <input
                    type="checkbox"
                    checked={!hidden.includes(c.key)}
                    onChange={() =>
                      setHidden((h) => (h.includes(c.key) ? h.filter((k) => k !== c.key) : [...h, c.key]))
                    }
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="rep__table-wrap">
        <table className="rep__table">
          <thead>
            <tr>
              <th className="rep__lcol">Этап</th>
              {cols.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.stage_id}>
                <td className="rep__lcol">{r.name}</td>
                {cols.map((c) => (
                  <td key={c.key} className={`rep__num ${c.key === 'cost' ? 'rep__na' : 'mono'}`}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rep__totals">
        <div className="rep__totcard">
          <span className="eyebrow">Выручка</span>
          <div className="rep__totline">
            <span>План</span>
            <b className="mono">{planTotals ? money(planTotals.revenue) : '—'}</b>
          </div>
          <div className="rep__totline">
            <span>Факт</span>
            <b className="mono">{money(totals.revenue)}</b>
          </div>
        </div>
        <div className="rep__totcard">
          <span className="eyebrow">Заказы</span>
          <div className="rep__totline">
            <span>План</span>
            <b className="mono">{planTotals ? num1(planTotals.orders) : '—'}</b>
          </div>
          <div className="rep__totline">
            <span>Факт</span>
            <b className="mono">{num1(totals.orders)}</b>
          </div>
        </div>
        <div className="rep__totcard">
          <span className="eyebrow">Средний чек</span>
          <div className="rep__totline">
            <span>План</span>
            <b className="mono">{planTotals ? money(planTotals.avg_check) : '—'}</b>
          </div>
          <div className="rep__totline">
            <span>Факт</span>
            <b className="mono">{money(totals.avg_check)}</b>
          </div>
        </div>
        <div className="rep__totcard">
          <span className="eyebrow">Цикл сделки (медиана)</span>
          <div className="rep__totline">
            <span>Дней</span>
            <b className="mono">{dealCycle.median_days == null ? 'н/д' : num1(dealCycle.median_days)}</b>
          </div>
          <div className="rep__totline">
            <span>Сделок</span>
            <b className="mono">{dealCycle.count}</b>
          </div>
        </div>
      </div>
    </div>
  )
}
