import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import FilterBar, { currentMonth } from './FilterBar'
import FunnelView from './FunnelView'
import MatrixView from './MatrixView'
import EmptyState from '../common/EmptyState'
import { useReportData } from '../../lib/reports/useReportData'

export default function MarketingPage() {
  const [filters, setFilters] = useState({ month: currentMonth(), branch_id: null })
  const [tab, setTab] = useState('matrix')
  const navigate = useNavigate()
  const { refs, orderedStages, meetHeldOrder, cohort, plan, loading } = useReportData(filters)

  useEffect(() => {
    if (!filters.branch_id && refs.branches.length) setFilters((f) => ({ ...f, branch_id: refs.branches[0].id }))
  }, [refs.branches, filters.branch_id])

  const effectiveFilters = filters
  const tasksById = useMemo(() => Object.fromEntries(refs.clientTasks.map((t) => [t.id, t])), [refs.clientTasks])
  const sourcesById = useMemo(() => Object.fromEntries(refs.demandSources.map((s) => [s.id, s])), [refs.demandSources])

  const openFunnel = (taskId, sourceId) => {
    setFilters((f) => ({ ...f, client_task_id: taskId, demand_source_id: sourceId }))
    setTab('funnel')
  }

  return (
    <div>
      <FilterBar refs={refs} value={effectiveFilters} onChange={setFilters} />

      <div className="rep__tabs">
        <button className={tab === 'matrix' ? 'is-active' : ''} onClick={() => setTab('matrix')}>
          Матрица план/факт
        </button>
        <button className={tab === 'funnel' ? 'is-active' : ''} onClick={() => setTab('funnel')}>
          Воронка
        </button>
      </div>

      {loading && <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>}

      {!loading && tab === 'matrix' &&
        (plan ? (
          <MatrixView
            cohort={cohort}
            plan={plan}
            filters={effectiveFilters}
            tasksById={tasksById}
            sourcesById={sourcesById}
            thresholds={{ low: 90, high: 110 }}
            onOpenFunnel={openFunnel}
          />
        ) : (
          <EmptyState
            title="План на период не утверждён"
            description="Матрица показывает план рядом с фактом. Утвердите план в разделе «Планирование»."
            action={
              <button className="btn btn--primary" onClick={() => navigate('/planning')}>
                Перейти к планированию
              </button>
            }
          />
        ))}

      {!loading && tab === 'funnel' && (
        <FunnelView
          cohort={cohort}
          plan={plan}
          orderedStages={orderedStages}
          meetHeldOrder={meetHeldOrder}
          filters={effectiveFilters}
        />
      )}
    </div>
  )
}
