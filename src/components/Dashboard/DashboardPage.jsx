import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReportData } from '../../lib/reports/useReportData'
import { buildFunnel, buildMatrix } from '../../lib/reports/buildReport'
import { totalsBy } from '../../lib/reports/fact'
import { listDecisions, isOverdue } from '../../lib/api/decisions'
import { currentMonth } from '../Reports/FilterBar'
import { money, num1, pct1, ratio1 } from '../../lib/format'
import EmptyState from '../common/EmptyState'
import { FunnelChart, BarCompare, ProgressRing } from './Charts'
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

  // Chart data: revenue plan vs fact, grouped by source and by task.
  const sourceItems = useMemo(() => {
    const keys = new Set([...planBySource.map((s) => s.demand_source_id), ...factBySource.map((s) => s.key)])
    return [...keys]
      .map((k) => ({
        key: k,
        label: sourcesById[k]?.name || '—',
        plan: planBySource.find((s) => s.demand_source_id === k)?.revenue || 0,
        fact: factBySource.find((s) => s.key === k)?.revenue || 0,
      }))
      .filter((i) => i.plan > 0 || i.fact > 0)
  }, [planBySource, factBySource, sourcesById])

  const taskItems = useMemo(() => {
    const map = new Map()
    for (const r of matrix.rows) {
      if (r.plan_revenue <= 0 && r.fact_revenue <= 0) continue
      const cur = map.get(r.client_task_id) || { key: r.client_task_id, plan: 0, fact: 0 }
      cur.plan += r.plan_revenue
      cur.fact += r.fact_revenue
      map.set(r.client_task_id, cur)
    }
    return [...map.values()].map((i) => ({ ...i, label: tasksById[i.key]?.name || '—' }))
  }, [matrix.rows, tasksById])

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
          <button className="dash__card dash__card--wide dash__card--split" onClick={() => navigate('/marketing')}>
            <div>
              <span className="eyebrow">Выполнение плана выручки</span>
              <div className="dash__big mono">{money(factRevenue)}</div>
              <div className="dash__row">
                <span>План</span>
                <b className="mono">{money(planRevenue)}</b>
              </div>
              <div className="dash__row">
                <span>Прогноз на конец месяца</span>
                <b className="mono">{money(fc)}</b>
              </div>
            </div>
            {planRevenue > 0 && <ProgressRing pct={(factRevenue / planRevenue) * 100} label="выполнено" />}
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
          <button className="dash__card dash__card--wide" onClick={() => navigate('/sales')}>
            <span className="eyebrow">Мини-воронка</span>
            <FunnelChart rows={funnel.rows} />
          </button>

          {/* Revenue by demand source */}
          <button className="dash__card" onClick={() => navigate('/marketing')}>
            <span className="eyebrow">Выручка по источникам спроса</span>
            {sourceItems.length === 0 ? <p className="dash__empty">Нет данных</p> : <BarCompare items={sourceItems} />}
          </button>

          {/* Revenue by client task */}
          <button className="dash__card" onClick={() => navigate('/marketing')}>
            <span className="eyebrow">Выручка по клиентским задачам</span>
            {taskItems.length === 0 ? <p className="dash__empty">Нет данных</p> : <BarCompare items={taskItems} />}
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
