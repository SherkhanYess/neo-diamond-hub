import { Fragment } from 'react'
import { computeMarketing } from '../../lib/planning/calc'
import { money, num1, ratio1 } from '../../lib/format'

// Editable marketing grid. `tasks` is the working state; `onEditTask` /
// `onEditSource` persist a single field. `readOnly` renders values only.
export default function MarketingSheet({ tasks, sourcesById, onEditTask, onEditSource, readOnly }) {
  const { taskTotals, sourceTotals, grandTotal } = computeMarketing(tasks)
  const totalsByTask = Object.fromEntries(taskTotals.map((t) => [t.client_task_id, t]))

  const cell = (value, onChange, suffix) =>
    readOnly ? (
      <span className="mono">{value}</span>
    ) : (
      <input
        className="input plan__input"
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )

  return (
    <div className="plan__sheet">
      <div className="plan__table-wrap">
        <table className="plan__table">
          <thead>
            <tr>
              <th className="plan__sticky-col">Задача / Источник</th>
              <th>Выручка</th>
              <th>Бюджет %</th>
              <th>Доля %</th>
              <th>Ср. чек</th>
              <th>Рекл. бюджет</th>
              <th>Заказы</th>
              <th>CAC</th>
              <th>ROAS</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const tt = totalsByTask[task.client_task_id] || {}
              const sharesBad = Math.abs((tt.shares_sum ?? 0) - 100) > 0.01
              const rows = computeMarketing([task]).rows
              const rowByKey = Object.fromEntries(rows.map((r) => [r.demand_source_id, r]))
              return (
                <Fragment key={task.client_task_id}>
                  <tr className="plan__task-row">
                    <td className="plan__sticky-col plan__task-name">{task.name}</td>
                    <td className="plan__num">
                      {readOnly ? money(task.target_revenue) : cell(task.target_revenue, (v) => onEditTask(task.client_task_id, 'target_revenue', v))}
                    </td>
                    <td className="plan__num">
                      {readOnly ? num1(task.ad_budget_pct) : cell(task.ad_budget_pct, (v) => onEditTask(task.client_task_id, 'ad_budget_pct', v))}
                    </td>
                    <td className={`plan__num ${sharesBad ? 'plan__bad' : ''}`} colSpan={1} title="Сумма долей источников">
                      {num1(tt.shares_sum)}
                    </td>
                    <td className="plan__num mono">{money(tt.avg_check)}</td>
                    <td className="plan__num mono">{money(tt.ad_budget)}</td>
                    <td className="plan__num mono">{num1(tt.orders)}</td>
                    <td className="plan__num mono">{money(tt.cac)}</td>
                    <td className="plan__num mono">{ratio1(tt.roas)}</td>
                  </tr>
                  {task.sources.map((src) => {
                    const r = rowByKey[src.demand_source_id] || {}
                    return (
                      <tr key={task.client_task_id + src.demand_source_id} className="plan__source-row">
                        <td className="plan__sticky-col plan__source-name">{src.name}</td>
                        <td className="plan__num mono">{money(r.revenue)}</td>
                        <td className="plan__num" />
                        <td className="plan__num">
                          {readOnly ? num1(src.revenue_share) : cell(src.revenue_share, (v) => onEditSource(task.client_task_id, src.demand_source_id, 'revenue_share', v))}
                        </td>
                        <td className="plan__num">
                          {readOnly ? money(src.avg_check) : cell(src.avg_check, (v) => onEditSource(task.client_task_id, src.demand_source_id, 'avg_check', v))}
                        </td>
                        <td className="plan__num">
                          {readOnly ? money(r.ad_budget) : cell(src.ad_budget ?? '', (v) => onEditSource(task.client_task_id, src.demand_source_id, 'ad_budget', v))}
                        </td>
                        <td className="plan__num mono">{num1(r.orders)}</td>
                        <td className="plan__num mono">{money(r.cac)}</td>
                        <td className="plan__num mono">{ratio1(r.roas)}</td>
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="plan__grand">
              <td className="plan__sticky-col">Итого</td>
              <td className="plan__num mono">{money(grandTotal.revenue)}</td>
              <td />
              <td />
              <td className="plan__num mono">{money(grandTotal.avg_check)}</td>
              <td className="plan__num mono">{money(grandTotal.ad_budget)}</td>
              <td className="plan__num mono">{num1(grandTotal.orders)}</td>
              <td className="plan__num mono">{money(grandTotal.cac)}</td>
              <td className="plan__num mono">{ratio1(grandTotal.roas)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <h3 className="plan__subhead">По источникам спроса</h3>
      <div className="plan__table-wrap">
        <table className="plan__table">
          <thead>
            <tr>
              <th className="plan__sticky-col">Источник</th>
              <th>Выручка</th>
              <th>Рекл. бюджет</th>
              <th>Ср. чек</th>
              <th>Заказы</th>
              <th>CAC</th>
              <th>ROAS</th>
            </tr>
          </thead>
          <tbody>
            {sourceTotals.map((s) => (
              <tr key={s.demand_source_id}>
                <td className="plan__sticky-col">{sourcesById[s.demand_source_id]?.name || '—'}</td>
                <td className="plan__num mono">{money(s.revenue)}</td>
                <td className="plan__num mono">{money(s.ad_budget)}</td>
                <td className="plan__num mono">{money(s.avg_check)}</td>
                <td className="plan__num mono">{num1(s.orders)}</td>
                <td className="plan__num mono">{money(s.cac)}</td>
                <td className="plan__num mono">{ratio1(s.roas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
