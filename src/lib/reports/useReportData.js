import { useState, useEffect, useCallback } from 'react'
import { listRef } from '../api/references'
import { loadCohort, loadApprovedPlan } from '../api/reports'
import { useBrand } from '../../context/BrandContext'

// Loads reference lists once, and cohort+plan whenever branch/month change.
export function useReportData(filters) {
  const { brandFilter } = useBrand()
  const [refs, setRefs] = useState({ branches: [], clientTasks: [], demandSources: [], leadSources: [], stages: [] })
  const [cohort, setCohort] = useState({ deals: [], events: [] })
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      listRef('branches'),
      listRef('client_tasks', { brandId: brandFilter }),
      listRef('demand_sources', { brandId: brandFilter }),
      listRef('lead_sources'),
      listRef('funnel_stages'),
    ]).then(([branches, clientTasks, demandSources, leadSources, stages]) =>
      setRefs({ branches, clientTasks, demandSources, leadSources, stages })
    )
  }, [brandFilter])

  const reload = useCallback(async () => {
    if (!filters.branch_id || !filters.month) return
    setLoading(true)
    try {
      const [c, p] = await Promise.all([
        loadCohort(filters.branch_id, filters.month, brandFilter),
        loadApprovedPlan(filters.branch_id, filters.month, brandFilter),
      ])
      setCohort(c)
      setPlan(p)
    } finally {
      setLoading(false)
    }
  }, [filters.branch_id, filters.month, brandFilter])

  useEffect(() => {
    reload()
  }, [reload])

  const orderedStages = [...refs.stages].sort((a, b) => a.sort_order - b.sort_order)
  const meetHeldOrder = orderedStages.find((s) => s.name.toLowerCase().includes('встреча состоял'))?.sort_order ?? Infinity

  return { refs, orderedStages, meetHeldOrder, cohort, plan, loading }
}
