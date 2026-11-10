import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useSalesData } from '../../lib/v2/useSalesData'
import { unitReport, credited, SALES_METRICS, UNIT_KINDS } from '../../lib/v2/sales'
import { monthPace } from '../../lib/v2/metrics'
import { useSalesFilters, salesStagePlans } from './SalesDeptPage'
import SalesFilters from './SalesFilters'
import PlanFactCell from '../Reports/PlanFactCell'
import KpiCards from '../v2/KpiCards'
import { fmtValue } from '../v2/PlanFactTree'
import PulseTable from '../v2/PulseTable'
import { funnelRows } from '../../lib/v2/pulse'
import EmptyState from '../common/EmptyState'
import '../v2/v2.css'
import './Sales.css'

// Подотдел: главный экран — сотрудники с личным план/фактом и конверсиями.
export default function UnitPage() {
  const { unitId } = useParams()
  const filters = useSalesFilters()
  const d = useSalesData(filters.value)

  const unit = d.units.find((u) => u.id === unitId)
  const memberIds = useMemo(() => d.members.filter((m) => m.unit_id === unitId).map((m) => m.profile_id), [d.members, unitId])
  const rep = useMemo(
    () => (unit ? unitReport({ unit, memberIds, deals: d.deals, events: d.events, stages: d.stages, targets: d.targets }) : null),
    [unit, memberIds, d.deals, d.events, d.stages, d.targets]
  )
  const unitDeals = useMemo(() => {
    if (!unit) return []
    const seen = new Set()
    return memberIds.flatMap((pid) => credited(d.deals, unit.kind, pid)).filter((x) => !seen.has(x.id) && seen.add(x.id))
  }, [unit, memberIds, d.deals])
  const unitEvents = useMemo(() => {
    const ids = new Set(unitDeals.map((x) => x.id))
    return d.events.filter((e) => ids.has(e.deal_id))
  }, [unitDeals, d.events])

  if (d.loading) return <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>
  if (!unit) {
    return (
      <EmptyState
        title="Подотдел недоступен"
        description="Его нет или ваша роль его не видит."
        action={<Link className="btn btn--primary" to={`/sales${filters.qs}`}>К отделу продаж</Link>}
      />
    )
  }

  const pace = monthPace(filters.value.month)
  const metrics = (unit.kpi?.length ? unit.kpi : ['leads', 'held', 'sales']).filter((k) => SALES_METRICS[k])
  const kpis = metrics.map((k) => ({
    key: k,
    label: SALES_METRICS[k].label,
    fmt: SALES_METRICS[k].fmt,
    additive: SALES_METRICS[k].additive,
    lowerBetter: SALES_METRICS[k].lowerBetter,
    plan: rep.total.plan[k] ?? null,
    fact: rep.total.fact[k],
  }))
  // Top-down check: personal targets must add up to the unit's target.
  const mismatches = Object.entries(rep.unitPlan)
    .filter(([k, v]) => rep.peoplePlan[k] != null && Math.abs(rep.peoplePlan[k] - v) > 0.0001)
    .map(([k, v]) => `${SALES_METRICS[k]?.label ?? k}: личные ${fmtValue(SALES_METRICS[k]?.fmt, rep.peoplePlan[k])} ≠ подотдел ${fmtValue(SALES_METRICS[k]?.fmt, v)}`)
  const rp = salesStagePlans(d.targets, d.stages, unit.id)
  const name = (pid) => d.people[pid]?.full_name || '—'

  return (
    <div>
      <SalesFilters value={filters.value} onChange={filters.onChange} brands={d.dict.brands} branches={d.dict.branches} />
      <div className="v2__controls">
        <Link to={`/sales${filters.qs}`} className="crud__link">
          ← Отдел продаж
        </Link>
        <h2 className="src__title">{unit.name}</h2>
        <span className="settings__brand">{UNIT_KINDS[unit.kind]}</span>
      </div>

      <KpiCards items={kpis} pace={pace} />

      {mismatches.length > 0 && (
        <div className="v2__banner">
          <span>Планы не сходятся: {mismatches.join('; ')}. Уточните личные планы в Планировании.</span>
          <Link className="btn btn--ghost" to="/planning">
            Планирование
          </Link>
        </div>
      )}

      <h3 className="src__section">Сотрудники</h3>
      {rep.rows.length === 0 ? (
        <p className="v2__note">В подотделе нет сотрудников — добавьте их в Настройках → Подотделы продаж.</p>
      ) : (
        <div className="rep__table-wrap">
          <table className="rep__table pft">
            <thead>
              <tr>
                <th className="rep__lcol">Сотрудник</th>
                {metrics.map((k) => (
                  <th key={k} title={SALES_METRICS[k].hint || ''}>
                    {SALES_METRICS[k].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rep.rows
                .slice()
                .sort((a, b) => (b.fact[metrics[0]] ?? 0) - (a.fact[metrics[0]] ?? 0))
                .map((r) => (
                  <tr key={r.profile_id}>
                    <td className="rep__lcol pft__name">{name(r.profile_id)}</td>
                    {metrics.map((k) => (
                      <td key={k} className="rep__num">
                        <PlanFactCell
                          plan={r.plan[k] ?? null}
                          fact={r.fact[k]}
                          fmt={SALES_METRICS[k].fmt}
                          lowerBetter={SALES_METRICS[k].lowerBetter}
                          pace={SALES_METRICS[k].additive ? pace : 1}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              <tr className="pft__row--d0 unit__total">
                <td className="rep__lcol">Итого подотдела</td>
                {metrics.map((k) => (
                  <td key={k} className="rep__num">
                    <PlanFactCell
                      plan={rep.total.plan[k] ?? null}
                      fact={rep.total.fact[k]}
                      fmt={SALES_METRICS[k].fmt}
                      lowerBetter={SALES_METRICS[k].lowerBetter}
                      pace={SALES_METRICS[k].additive ? pace : 1}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="v2__note">
        {unit.kind === 'lead_center' && 'Лид-менеджеру засчитываются этапы до «Встреча состоялась» по сделкам, где он указан лид-менеджером. '}
        {unit.kind === 'consultations' && 'Консультанту засчитываются встречи и новые продажи по сделкам, где он указан консультантом. '}
        {unit.kind === 'account' && 'Аккаунт-менеджеру засчитываются повторные продажи клиентов базы. '}
        Итог подотдела — сумма сотрудников. Конверсии и скорость ответа — по сумме сделок, не среднее процентов.
      </p>

      <h3 className="src__section">План-факт подотдела</h3>
      <PulseTable
        rows={funnelRows({ deals: unitDeals, events: unitEvents, orderedStages: d.dict.stages, ...rp }).rows}
        month={filters.value.month}
        pace={pace}
        storageKey="sales.unit.hidden"
      />
    </div>
  )
}
