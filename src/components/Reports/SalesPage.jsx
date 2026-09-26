import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import FilterBar, { currentMonth } from './FilterBar'
import FunnelView from './FunnelView'
import EmptyState from '../common/EmptyState'
import { useReportData } from '../../lib/reports/useReportData'

export default function SalesPage() {
  const [filters, setFilters] = useState({ month: currentMonth(), branch_id: null })
  const navigate = useNavigate()
  const { refs, orderedStages, meetHeldOrder, cohort, plan, loading } = useReportData(filters)

  useEffect(() => {
    if (!filters.branch_id && refs.branches.length) setFilters((f) => ({ ...f, branch_id: refs.branches[0].id }))
  }, [refs.branches, filters.branch_id])

  const effectiveFilters = filters
  const hasFact = cohort.deals.length > 0

  return (
    <div>
      <FilterBar refs={refs} value={effectiveFilters} onChange={setFilters} />
      {loading && <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>}
      {!loading && !plan && !hasFact && (
        <EmptyState
          title="Нет данных за период"
          description="План не утверждён и сделок нет. Начните с планирования."
          action={
            <button className="btn btn--primary" onClick={() => navigate('/planning')}>
              Перейти к планированию
            </button>
          }
        />
      )}
      {!loading && (plan || hasFact) && (
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
