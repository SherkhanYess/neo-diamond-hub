import { useState, useEffect, useCallback, useMemo } from 'react'
import { useBrand } from '../../context/BrandContext'
import { loadCohort, loadAdStats, loadManualSpend, loadCommercePlans, loadDictionaries } from './loaders'
import { spendIndex, stageIds } from './metrics'

const EMPTY_DICT = { brands: [], branches: [], tasks: [], sources: [], converters: [], stages: [] }

// One loader for every v2 report page: same cohort, same spend, same plans —
// which is what keeps Коммерция, Маркетинг and Отдел продаж in agreement.
// `brandScoped: false` ignores the brand switcher (Отдел продаж).
export function useV2Data({ period, month, branchId = null, brandScoped = true }) {
  // Period { from, to } of the reports, or a month (Планирование).
  const range = period ?? month
  const rangeKey = typeof range === 'string' ? range : `${range?.from}|${range?.to}`
  const brand = useBrand()
  const brandId = brandScoped ? brand.brandFilter : null
  const [dict, setDict] = useState(EMPTY_DICT)
  const [data, setData] = useState({ deals: [], events: [], adStats: [], manual: [], plans: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadDictionaries(brandId).then(setDict).catch((e) => setError(e.message))
  }, [brandId])

  const reload = useCallback(async () => {
    if (!range) return
    setLoading(true)
    setError(null)
    try {
      const [cohort, adStats, manual, plans] = await Promise.all([
        loadCohort(branchId, range, brandId),
        loadAdStats(range, brandId),
        loadManualSpend(range, brandId),
        loadCommercePlans(range, { brandId, branchId }),
      ])
      setData({ deals: cohort.deals, events: cohort.events, adStats, manual, plans })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, branchId, brandId])

  useEffect(() => {
    reload()
  }, [reload])

  const derived = useMemo(() => {
    const spend = spendIndex(data.adStats, data.manual)
    const spendBrands = new Set([...data.adStats.map((r) => r.brand_id), ...data.manual.map((r) => r.brand_id)])
    return { spend, spendBrands, stages: stageIds(dict.stages) }
  }, [data, dict.stages])

  const byId = useMemo(() => {
    const idx = (list) => Object.fromEntries(list.map((x) => [x.id, x]))
    return {
      brands: idx(dict.brands),
      tasks: idx(dict.tasks),
      sources: idx(dict.sources),
      converters: idx(dict.converters),
      branches: idx(dict.branches),
    }
  }, [dict])

  return { ...data, dict, byId, ...derived, brandId, isAll: brandScoped && brand.isAll, loading, error, reload }
}
