import { useState, useEffect, useCallback } from 'react'
import { listRef } from '../api/references'
import { loadCohort, loadApprovedPlan } from '../api/reports'

// Loads reference lists once, and cohort+plan whenever branch/month change.
export function useReportData(filters) {
  const [refs, setRefs] = useState({ branches: [], clientTasks: [], demandSources: [], leadSources: [], stages: [] })
  const [cohort, setCohort] = useState({ deals: [], events: [] })
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      listRef('branches'),
      listRef('client_tasks'),
      listRef('demand_sources'),
      listRef('lead_sources'),
      listRef('funnel_stages'),
    ]).then(([branches, clientTasks, demandSources, leadSources, stages]) =>
      setRefs({ branches, clientTasks, demandSources, leadSources, stages })
    )
  }, [])

  const reload = useCallback(async () => {
    if (!filters.branch_id || !filters.month) return
    setLoading(true)
    try {
      const [c, p] = await Promise.all([
        loadCohort(filters.branch_id, filters.month),
        loadApprovedPlan(filters.branch_id, filters.month),
      ])
      setCohort(c)
      setPlan(p)
    } finally {
      setLoading(false)
    }
  }, [filters.branch_id, filters.month])

  useEffect(() => {
    reload()
  }, [reload])

  const orderedStages = [...refs.stages].sort((a, b) => a.sort_order - b.sort_order)
  const meetHeldOrder = orderedStages.find((s) => s.name.toLowerCase().includes('встреча состоял'))?.sort_order ?? Infinity

  return { refs, orderedStages, meetHeldOrder, cohort, plan, loading }
}
