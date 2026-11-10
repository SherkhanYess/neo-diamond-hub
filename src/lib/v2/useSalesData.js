import { useState, useEffect, useMemo } from 'react'
import { useSession } from '../../context/SessionContext'
import { useV2Data } from './useV2Data'
import { loadSalesStructure, loadSalesTargets } from './loaders'
import { salesScope } from '../permissions'

// Отдел продаж data: the shared sales department (both brands). Brand is a
// filter here, not context. Visibility follows the role: РОП → everyone,
// unit head → own unit(s), employee → self (RLS enforces the same on deals).
export function useSalesData({ period, month, brandId = '', branchId = '' }) {
  const range = period ?? month
  const rangeKey = typeof range === 'string' ? range : `${range?.from}|${range?.to}`
  const { profile, caps } = useSession()
  const base = useV2Data({ period: range, branchId: branchId || null, brandScoped: false })
  const [structure, setStructure] = useState({ units: [], members: [], profiles: [] })
  const [targets, setTargets] = useState([])

  useEffect(() => {
    loadSalesStructure().then(setStructure)
  }, [])
  useEffect(() => {
    loadSalesTargets(range).then((r) => setTargets(r.targets))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey])

  const scope = salesScope(caps)
  const me = profile?.id

  const view = useMemo(() => {
    const { units, members } = structure
    let visibleUnits = units
    let visibleMembers = members
    if (scope === 'unit') {
      const headed = new Set(units.filter((u) => u.head_profile_id === me).map((u) => u.id))
      visibleUnits = units.filter((u) => headed.has(u.id) || members.some((m) => m.unit_id === u.id && m.profile_id === me))
      visibleMembers = members.filter((m) => headed.has(m.unit_id) || m.profile_id === me)
    } else if (scope === 'self') {
      visibleMembers = members.filter((m) => m.profile_id === me)
      visibleUnits = units.filter((u) => visibleMembers.some((m) => m.unit_id === u.id))
    } else if (!scope) {
      visibleUnits = []
      visibleMembers = []
    }
    const deals = brandId ? base.deals.filter((d) => d.brand_id === brandId) : base.deals
    const ids = new Set(deals.map((d) => d.id))
    const events = base.events.filter((e) => ids.has(e.deal_id))
    return { units: visibleUnits, members: visibleMembers, deals, events }
  }, [structure, scope, me, brandId, base.deals, base.events])

  const people = useMemo(() => Object.fromEntries(structure.profiles.map((p) => [p.id, p])), [structure.profiles])

  return { ...base, ...view, people, targets, scope, me, allUnits: structure.units }
}
