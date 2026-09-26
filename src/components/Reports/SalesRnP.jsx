import { useState, useMemo } from 'react'
import { buckets, funnelSeries, sumOverKeys, monthDays } from '../../lib/reports/timeseries'
import { plannedFunnel } from '../../lib/reports/buildReport'
import PlanFactCell from './PlanFactCell'
import { money, num1 } from '../../lib/format'
import './Reports.css'

// РнП-style daily/weekly table: metrics as rows, days (or weeks) as columns.
export default function SalesRnP({ cohort, plan, orderedStages, filters, thresholds }) {
  const [grouping, setGrouping] = useState('week')
  const [hiddenRows, setHiddenRows] = useState([])
  const [pickOpen, setPickOpen] = useState(false)

  const cols = useMemo(() => buckets(filters.month, grouping), [filters.month, grouping])
  const series = useMemo(() => funnelSeries(cohort.deals, cohort.events), [cohort])
  const planCounts = useMemo(() => plannedFunnel(plan, orderedStages), [plan, orderedStages])
  const daysInMonth = monthDays(filters.month).length

  // Rows: each funnel stage (count) + a sales-revenue row.
  const stageRows = orderedStages.map((s) => ({
    key: s.id,
    label: s.name,
    fmt: 'num1',
    monthPlan: planCounts[s.id] ?? null,
    dayMap: series.byStageDay.get(s.id),
    isRevenue: false,
  }))
  const revenueRow = {
    key: 'revenue',
    label: 'Сумма продаж',
    fmt: 'money',
    monthPlan: plan?.computed?.grandTotal?.revenue ?? null,
    dayMapRevenue: new Map([...series.salesByDay.entries()].map(([k, v]) => [k, v.revenue])),
    isRevenue: true,
  }
  const allRows = [...stageRows, revenueRow]
  const rows = allRows.filter((r) => !hiddenRows.includes(r.key))

  const bucketPlan = (monthPlan, keys) => (monthPlan == null ? null : (monthPlan / daysInMonth) * keys.length)
  const bucketFact = (row, keys) =>
    row.isRevenue ? sumOverKeys(row.dayMapRevenue, keys) : sumOverKeys(row.dayMap, keys)
  const monthFact = (row) => {
    const map = row.isRevenue ? row.dayMapRevenue : row.dayMap
    return map ? [...map.values()].reduce((s, v) => s + v, 0) : 0
  }

  return (
    <div>
      <div className="mx__toolbar">
        <div className="mx__group-toggle">
          <button className={grouping === 'day' ? 'is-active' : ''} onClick={() => setGrouping('day')}>
            По дням
          </button>
          <button className={grouping === 'week' ? 'is-active' : ''} onClick={() => setGrouping('week')}>
            По неделям
          </button>
        </div>
        <div className="colpick mx__view-btn">
          <button className="btn btn--ghost" onClick={() => setPickOpen((o) => !o)}>
            Метрики
          </button>
          {pickOpen && (
            <div className="colpick__menu" onMouseLeave={() => setPickOpen(false)}>
              {allRows.map((r) => (
                <label key={r.key}>
                  <input
                    type="checkbox"
                    checked={!hiddenRows.includes(r.key)}
                    onChange={() =>
                      setHiddenRows((h) => (h.includes(r.key) ? h.filter((k) => k !== r.key) : [...h, r.key]))
                    }
                  />
                  {r.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rep__table-wrap">
        <table className="rep__table rnp">
          <thead>
            <tr>
              <th className="rep__lcol">Показатель</th>
              <th className="rnp__month">Месяц (план/факт)</th>
              {cols.map((c) => (
                <th key={c.id} className="rnp__col">
                  <div>{c.label}</div>
                  <div className="rnp__sub">{c.sub}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="rep__lcol">{row.label}</td>
                <td className="rnp__month">
                  <PlanFactCell plan={row.monthPlan} fact={monthFact(row)} fmt={row.fmt} thresholds={thresholds} />
                </td>
                {cols.map((c) => (
                  <td key={c.id} className="rep__num">
                    <PlanFactCell
                      plan={bucketPlan(row.monthPlan, c.keys)}
                      fact={bucketFact(row, c.keys)}
                      fmt={row.fmt}
                      thresholds={thresholds}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rep__note">
        План распределён равномерно по дням месяца (ежедневный план). Столбцы — {grouping === 'week' ? 'недели' : 'дни'};
        переключите вид кнопками выше. «Метрики» скрывают строки.
      </p>
    </div>
  )
}
