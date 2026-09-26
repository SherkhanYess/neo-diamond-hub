import { buildMatrix } from '../../lib/reports/buildReport'
import { money, num1, pct1 } from '../../lib/format'
import './Reports.css'

const pctColor = (planV, factV, thresholds) => {
  if (!planV) return ''
  const p = (factV / planV) * 100
  if (p < thresholds.low) return 'rep__below'
  if (p >= thresholds.high) return 'rep__above'
  return 'rep__ok'
}

export default function MatrixView({ cohort, plan, filters, tasksById, sourcesById, thresholds, onOpenFunnel }) {
  const { rows } = buildMatrix({ deals: cohort.deals, plan, filters })

  if (!plan) {
    return null
  }

  return (
    <div className="rep__table-wrap">
      <table className="rep__table rep__matrix">
        <thead>
          <tr>
            <th className="rep__lcol">Задача × Источник</th>
            <th>Выручка план</th>
            <th>Выручка факт</th>
            <th>%</th>
            <th>Заказы план</th>
            <th>Заказы факт</th>
            <th>%</th>
            <th>Ср. чек план</th>
            <th>Ср. чек факт</th>
            <th>CAC план</th>
            <th>ROAS план</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.client_task_id + r.demand_source_id}
              className="rep__clickable"
              onClick={() => onOpenFunnel(r.client_task_id, r.demand_source_id)}
            >
              <td className="rep__lcol">
                {tasksById[r.client_task_id]?.name || '—'} · {sourcesById[r.demand_source_id]?.name || '—'}
              </td>
              <td className="rep__num mono">{money(r.plan_revenue)}</td>
              <td className={`rep__num mono ${pctColor(r.plan_revenue, r.fact_revenue, thresholds)}`}>{money(r.fact_revenue)}</td>
              <td className="rep__num mono">{r.plan_revenue ? pct1((r.fact_revenue / r.plan_revenue) * 100) : '—'}</td>
              <td className="rep__num mono">{num1(r.plan_orders)}</td>
              <td className={`rep__num mono ${pctColor(r.plan_orders, r.fact_orders, thresholds)}`}>{num1(r.fact_orders)}</td>
              <td className="rep__num mono">{r.plan_orders ? pct1((r.fact_orders / r.plan_orders) * 100) : '—'}</td>
              <td className="rep__num mono">{money(r.plan_avg_check)}</td>
              <td className="rep__num mono">{money(r.fact_avg_check)}</td>
              <td className="rep__num mono">{money(r.plan_cac)}</td>
              <td className="rep__num mono">{num1(r.plan_roas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="rep__note">
        CAC и ROAS по факту требуют рекламного расхода — появятся с подключением рекламных
        кабинетов. Клик по строке открывает воронку с этими фильтрами.
      </p>
    </div>
  )
}
