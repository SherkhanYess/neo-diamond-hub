import { buildFunnel } from '../../lib/reports/buildReport'
import { money, num1, pct1, ratio1 } from '../../lib/format'
import './Reports.css'

const na = (v, render) => (v == null ? <span className="rep__na">н/д</span> : render(v))

export default function FunnelView({ cohort, plan, orderedStages, meetHeldOrder, filters }) {
  const { rows, totals, dealCycle, planTotals } = buildFunnel({
    deals: cohort.deals,
    events: cohort.events,
    plan,
    orderedStages,
    filters,
    meetHeldOrder,
  })

  return (
    <div>
      {filters.demand_source_id && (
        <p className="rep__note">
          Эффект источников спроса оценивается по сделкам, дошедшим до встречи (там становится
          известно первое касание).
        </p>
      )}
      <div className="rep__table-wrap">
        <table className="rep__table">
          <thead>
            <tr>
              <th className="rep__lcol">Этап</th>
              <th>План</th>
              <th>Факт</th>
              <th>% вып.</th>
              <th>Конверсия (факт)</th>
              <th>Стоимость этапа</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.stage_id}>
                <td className="rep__lcol">{r.name}</td>
                <td className="rep__num mono">{na(r.plan, (v) => num1(v))}</td>
                <td className="rep__num mono">{na(r.fact, (v) => num1(v))}</td>
                <td className="rep__num mono">{na(r.done_pct, (v) => pct1(v))}</td>
                <td className="rep__num mono">{na(r.fact_conv, (v) => pct1(v * 100))}</td>
                <td className="rep__num rep__na">н/д</td>
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
