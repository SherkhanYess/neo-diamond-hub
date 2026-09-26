import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReportData } from '../../lib/reports/useReportData'
import { buildFunnel, buildMatrix } from '../../lib/reports/buildReport'
import { totalsBy } from '../../lib/reports/fact'
import { listDecisions, isOverdue } from '../../lib/api/decisions'
import { currentMonth } from '../Reports/FilterBar'
import { money, num1, pct1, ratio1 } from '../../lib/format'
import EmptyState from '../common/EmptyState'
import './Dashboard.css'

function forecast(fact, month) {
  const d = new Date(month)
  const now = new Date()
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const sameMonth = now.getFullYear() === d.getFullYear() && now.getMonth() === d.getMonth()
  const elapsed = sameMonth ? now.getDate() : daysInMonth
  return elapsed > 0 ? (fact / elapsed) * daysInMonth : fact
}

export default function DashboardPage() {
  const [filters, setFilters] = useState({ month: currentMonth(), branch_id: null })
  const [decisions, setDecisions] = useState([])
  const navigate = useNavigate()
  const { refs, orderedStages, meetHeldOrder, cohort, plan, loading } = useReportData(filters)

  useEffect(() => {
    if (!filters.branch_id && refs.branches.length) setFilters((f) => ({ ...f, branch_id: refs.branches[0].id }))
  }, [refs.branches, filters.branch_id])

  useEffect(() => {
    listDecisions().then(setDecisions).catch(() => setDecisions([]))
  }, [])

  const tasksById = useMemo(() => Object.fromEntries(refs.clientTasks.map((t) => [t.id, t])), [refs.clientTasks])
  const sourcesById = useMemo(() => Object.fromEntries(refs.demandSources.map((s) => [s.id, s])), [refs.demandSources])

  const funnel = useMemo(
    () => buildFunnel({ deals: cohort.deals, events: cohort.events, plan, orderedStages, filters, meetHeldOrder }),
    [cohort, plan, orderedStages, filters, meetHeldOrder]
  )
  const matrix = useMemo(() => buildMatrix({ deals: cohort.deals, plan, filters }), [cohort, plan, filters])

  const factRevenue = funnel.totals.revenue
  const planRevenue = funnel.planTotals?.revenue || 0
  const fc = forecast(factRevenue, filters.month)

  // Biggest deviations: matrix rows with a plan, sorted by revenue shortfall.
  const deviations = useMemo(
    () =>
      matrix.rows
        .filter((r) => r.plan_revenue > 0)
        .map((r) => ({ ...r, gap: r.fact_revenue - r.plan_revenue }))
        .sort((a, b) => a.gap - b.gap)
        .slice(0, 5),
    [matrix.rows]
  )

  const factBySource = useMemo(() => totalsBy(cohort.deals.filter((d) => d.sale_at), 'demand_source_id'), [cohort.deals])
  const planBySource = plan?.computed?.sourceTotals || []

  const overdue = decisions.filter((d) => isOverdue(d))

  if (loading) return <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>

  const month = new Date(filters.month).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })

  return (
    <div className="dash">
      <div className="dash__controls">
        <select
          className="select"
          value={filters.branch_id || ''}
          onChange={(e) => setFilters((f) => ({ ...f, branch_id: e.target.value }))}
        >
          {refs.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <input
          className="input"
          type="month"
          value={filters.month.slice(0, 7)}
          onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value + '-01' }))}
        />
        <span className="dash__month">{month}</span>
      </div>

      {!plan && cohort.deals.length === 0 ? (
        <EmptyState
          title="Нет данных за период"
          description="Утвердите план и дождитесь сделок из CRM."
          action={<button className="btn btn--primary" onClick={() => navigate('/planning')}>Перейти к планированию</button>}
        />
      ) : (
        <div className="dash__grid">
          {/* Revenue plan execution */}
          <button className="dash__card dash__card--wide" onClick={() => navigate('/marketing')}>
            <span className="eyebrow">Выполнение плана выручки</span>
            <div className="dash__big mono">{money(factRevenue)}</div>
            <div className="dash__row">
              <span>План</span>
              <b className="mono">{money(planRevenue)}</b>
            </div>
            <div className="dash__row">
              <span>Выполнение</span>
              <b className="mono">{planRevenue ? pct1((factRevenue / planRevenue) * 100) : '—'}</b>
            </div>
            <div className="dash__row">
              <span>Прогноз на конец месяца</span>
              <b className="mono">{money(fc)}</b>
            </div>
          </button>

          {/* Key metrics */}
          <div className="dash__card">
            <span className="eyebrow">Ключевые метрики</span>
            <div className="dash__row"><span>Заказы (факт/план)</span><b className="mono">{num1(funnel.totals.orders)} / {funnel.planTotals ? num1(funnel.planTotals.orders) : '—'}</b></div>
            <div className="dash__row"><span>Средний чек</span><b className="mono">{money(funnel.totals.avg_check)}</b></div>
            <div className="dash__row"><span>CAC план</span><b className="mono">{funnel.planTotals ? money(funnel.planTotals.cac) : '—'}</b></div>
            <div className="dash__row"><span>ROAS план</span><b className="mono">{funnel.planTotals ? ratio1(funnel.planTotals.roas) : '—'}</b></div>
          </div>

          {/* Mini funnel */}
          <button className="dash__card" onClick={() => navigate('/sales')}>
            <span className="eyebrow">Мини-воронка</span>
            {funnel.rows.map((r) => (
              <div className="dash__row" key={r.stage_id}>
                <span>{r.name}</span>
                <b className="mono">{r.fact == null ? 'н/д' : num1(r.fact)}{r.plan ? ` / ${num1(r.plan)}` : ''}</b>
              </div>
            ))}
          </button>

          {/* Revenue by demand source */}
          <button className="dash__card" onClick={() => navigate('/marketing')}>
            <span className="eyebrow">Выручка по источникам спроса</span>
            {planBySource.length === 0 && factBySource.length === 0 && <p className="dash__empty">Нет данных</p>}
            {(planBySource.length ? planBySource : factBySource).map((s) => {
              const f = factBySource.find((x) => x.key === s.demand_source_id)?.revenue || 0
              return (
                <div className="dash__row" key={s.demand_source_id || s.key}>
                  <span>{sourcesById[s.demand_source_id || s.key]?.name || '—'}</span>
                  <b className="mono">{money(f)}{s.revenue ? ` / ${money(s.revenue)}` : ''}</b>
                </div>
              )
            })}
          </button>

          {/* Biggest deviations */}
          <div className="dash__card dash__card--wide">
            <span className="eyebrow">Главные отклонения</span>
            {deviations.length === 0 && <p className="dash__empty">План не утверждён</p>}
            {deviations.map((r) => (
              <div className="dash__row" key={r.client_task_id + r.demand_source_id}>
                <span>{tasksById[r.client_task_id]?.name || '—'} · {sourcesById[r.demand_source_id]?.name || '—'}</span>
                <b className={`mono ${r.gap < 0 ? 'dash__neg' : 'dash__pos'}`}>
                  {r.gap >= 0 ? '+' : ''}{money(r.gap)}
                </b>
              </div>
            ))}
          </div>

          {/* Decisions to review */}
          <button className="dash__card" onClick={() => navigate('/decisions')}>
            <span className="eyebrow">Решения на проверку</span>
            {overdue.length === 0 && <p className="dash__empty">Просроченных нет</p>}
            {overdue.slice(0, 5).map((d) => (
              <div className="dash__row" key={d.id}>
                <span>{d.hypothesis || d.metric_name || 'Решение'}</span>
                <b className="dash__neg">{d.check_date ? new Date(d.check_date).toLocaleDateString('ru-RU') : ''}</b>
              </div>
            ))}
          </button>
        </div>
      )}
    </div>
  )
}
