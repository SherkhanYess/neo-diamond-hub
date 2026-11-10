import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSalesData } from '../../lib/v2/useSalesData'
import { departmentReport, salesBy, SALES_METRICS, UNIT_KINDS } from '../../lib/v2/sales'
import SalesFilters from './SalesFilters'
import CycleBlock, { useClosedSales } from '../v2/CycleBlock'
import { usePeriod } from '../../context/PeriodContext'
import { periodPace } from '../../lib/v2/period'
import KpiCards from '../v2/KpiCards'
import { fmtValue } from '../v2/PlanFactTree'
import PulseTable from '../v2/PulseTable'
import { funnelRows } from '../../lib/v2/pulse'
import FunnelView from '../Reports/FunnelView'
import EmptyState from '../common/EmptyState'
import '../v2/v2.css'
import './Sales.css'

export function useSalesFilters() {
  const [params, setParams] = useSearchParams()
  const { period } = usePeriod()
  const value = {
    period,
    brandId: params.get('brand') || '',
    branchId: params.get('branch') || '',
  }
  const onChange = (v) =>
    setParams(Object.fromEntries(Object.entries({ brand: v.brandId, branch: v.branchId }).filter(([, x]) => x)), {
      replace: true,
    })
  const qs = `?${new URLSearchParams(Object.fromEntries(Object.entries({ brand: value.brandId, branch: value.branchId }).filter(([, x]) => x)))}`
  return { value, onChange, qs }
}

// Sales targets → plan per stage (meetings held, sales) and revenue.
export function salesStagePlans(targets, stages, unitId = null) {
  const pick = (metric) => {
    const own = targets.filter((t) => (t.unit_id ?? null) === unitId && !t.profile_id && t.metric === metric)
    if (own.length) return own.reduce((a, t) => a + Number(t.value), 0)
    // A unit without its own target: the sum of its people's targets.
    const people = unitId ? targets.filter((t) => t.unit_id === unitId && t.profile_id && t.metric === metric) : []
    return people.length ? people.reduce((a, t) => a + Number(t.value), 0) : null
  }
  const plans = {}
  // Department view takes only department-level targets: a unit's ЦКП (e.g.
  // Лид-центр meetings with new clients) is not the department's number.
  const held = pick('held')
  if (held != null && stages.held) plans[stages.held] = Number(held)
  const sales = pick('sales') ?? pick('repeat_sales')
  if (sales != null && stages.sale) plans[stages.sale] = sales
  return { stagePlans: plans, revenuePlan: pick('revenue') ?? pick('repeat_revenue') }
}

// Отдел продаж — зона РОПа: подотделы, люди, общая аналитика.
export default function SalesDeptPage() {
  const navigate = useNavigate()
  const filters = useSalesFilters()
  const [view, setView] = useState('table')
  const d = useSalesData(filters.value)
  const closed = useClosedSales(filters.value.period, { brandId: filters.value.brandId || null, branchId: filters.value.branchId || null })

  const rep = useMemo(
    () => departmentReport({ units: d.units, members: d.members, deals: d.deals, events: d.events, stages: d.stages, targets: d.targets }),
    [d.units, d.members, d.deals, d.events, d.stages, d.targets]
  )
  const pace = periodPace(filters.value.period)
  const [basis, setBasis] = useState('stage')
  const g = rep.general
  const heldPlan = rep.plan.held ?? null

  if (!d.scope) {
    return <EmptyState title="Нет доступа к отделу продаж" description="Роли не выдано право на отдел продаж." />
  }

  const kpis = [
    { key: 'revenue', label: 'Выручка', fmt: 'money', additive: true, plan: rep.plan.revenue ?? null, fact: g.revenue + g.repeat_revenue },
    { key: 'sales', label: 'Продажи (всего)', fmt: 'int', additive: true, plan: rep.plan.sales ?? null, fact: g.sales + g.repeat_sales },
    { key: 'held', label: 'Встреч проведено', fmt: 'int', additive: true, plan: heldPlan, fact: g.held },
    { key: 'leads', label: 'Обращения', fmt: 'int', plan: null, fact: g.leads },
    { key: 'avg_check', label: 'Средний чек', fmt: 'money', plan: null, fact: g.avg_check },
    { key: 'cr', label: 'Встреча → продажа', fmt: 'pct', plan: null, fact: g.cr_held_sale },
  ]

  const brandRows = salesBy(d.deals, 'brand_id')
  const taskRows = salesBy(d.deals, 'client_task_id')
  const rp = salesStagePlans(d.targets, d.stages)
  const tableRows = funnelRows({ deals: d.deals, events: d.events, orderedStages: d.dict.stages, ...rp, basis }).rows
  const gapLines = [
    rep.gaps.held_without_lead > 0 && `${rep.gaps.held_without_lead} встреч без лид-менеджера из Лид-центра`,
    rep.gaps.sales_without_consultant > 0 && `${rep.gaps.sales_without_consultant} продаж без консультанта из подотдела «Консультации»`,
    rep.gaps.repeat_without_account > 0 && `${rep.gaps.repeat_without_account} повторных продаж без аккаунт-менеджера`,
  ].filter(Boolean)

  return (
    <div>
      <SalesFilters value={filters.value} onChange={filters.onChange} brands={d.dict.brands} branches={d.dict.branches} />

      {d.loading ? (
        <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>
      ) : (
        <>
          <div className="unitgrid">
            {rep.units.map((u) => {
              const ckp = u.unit.kpi?.[0]
              const meta = SALES_METRICS[ckp]
              const plan = u.total.plan[ckp]
              const fact = u.total.fact[ckp]
              const tempo = plan && meta?.additive ? (fact / (plan * (pace || 1))) * 100 : plan ? (fact / plan) * 100 : null
              const good = tempo == null ? null : meta?.lowerBetter ? tempo <= 100 : tempo >= 100
              return (
                <button key={u.unit.id} className="unittile" onClick={() => navigate(`/sales/unit/${u.unit.id}${filters.qs}`)}>
                  <span className="eyebrow">{UNIT_KINDS[u.unit.kind]}</span>
                  <h3>{u.unit.name}</h3>
                  <span className="unittile__ckp">ЦКП · {meta?.label ?? '—'}</span>
                  <span className="unittile__value mono">{fmtValue(meta?.fmt, fact)}</span>
                  <span className="unittile__plan">
                    план {plan == null ? '—' : fmtValue(meta?.fmt, plan)}
                    {tempo != null && (
                      <b className={good ? 'kpi__pct--good' : 'kpi__pct--bad'}>
                        {' '}
                        · {pace > 0 && pace < 1 && meta?.additive ? 'темп' : ''} {Math.round(tempo)}%
                      </b>
                    )}
                  </span>
                  <span className="unittile__people">{u.rows.length} сотр.</span>
                </button>
              )
            })}
          </div>

          <h3 className="src__section">Общая аналитика</h3>
          <KpiCards items={kpis} pace={pace} />

          {gapLines.length > 0 && (
            <div className="v2__banner">
              <span>Не засчитано ни одному сотруднику подотдела: {gapLines.join('; ')}. Проверьте ответственных в сделках или состав подотделов.</span>
              <button className="btn btn--ghost" onClick={() => navigate('/settings')}>
                Подотделы
              </button>
            </div>
          )}

          <div className="salesplit">
            <div className="rep__table-wrap">
              <table className="rep__table">
                <thead>
                  <tr>
                    <th className="rep__lcol">Бренд</th>
                    <th>Продажи</th>
                    <th>Выручка</th>
                  </tr>
                </thead>
                <tbody>
                  {brandRows.map((r) => (
                    <tr key={r.key}>
                      <td className="rep__lcol">{d.byId.brands[r.key]?.name ?? '—'}</td>
                      <td className="rep__num mono">{r.sales}</td>
                      <td className="rep__num mono">{fmtValue('money', r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rep__table-wrap">
              <table className="rep__table">
                <thead>
                  <tr>
                    <th className="rep__lcol">Клиентская задача</th>
                    <th>Продажи</th>
                    <th>Выручка</th>
                  </tr>
                </thead>
                <tbody>
                  {taskRows.map((r) => (
                    <tr key={r.key}>
                      <td className="rep__lcol">{d.byId.tasks[r.key]?.name ?? 'Без задачи'}</td>
                      <td className="rep__num mono">{r.sales}</td>
                      <td className="rep__num mono">{fmtValue('money', r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rep__tabs" style={{ marginTop: 'var(--space-4)' }}>
            <button className={view === 'table' ? 'is-active' : ''} onClick={() => setView('table')}>
              План-факт
            </button>
            <button className={view === 'funnel' ? 'is-active' : ''} onClick={() => setView('funnel')}>
              Воронка
            </button>
          </div>
          {view === 'table' ? (
            <PulseTable
              rows={tableRows}
              period={filters.value.period}
              pace={pace}
              basis={basis}
              onBasis={setBasis}
              storageKey="sales.table.hidden"
            />
          ) : (
            <FunnelView cohort={{ deals: d.deals, events: d.events }} plan={null} orderedStages={d.dict.stages} filters={{}} />
          )}
          <p className="v2__note">
            Сделка засчитывается по этапам: лид-менеджеру — до «Встреча состоялась», консультанту — продажа, аккаунт-менеджеру —
            повторная продажа. Подотдел = сумма сотрудников, отдел = сумма подотделов. Бренд здесь — фильтр: команда общая.
          </p>
          <CycleBlock
            deals={closed.deals}
            loading={closed.loading}
            error={closed.error}
            groups={[
              { key: 'city', label: 'По городам', col: 'Город', keyOf: (x) => closed.cities[x.branch_id]?.id, nameOf: (id) => Object.values(closed.cities).find((c) => c.id === id)?.name ?? '—' },
              { key: 'task', label: 'По клиентским задачам', col: 'Клиентская задача', keyOf: (x) => x.client_task_id, nameOf: (id) => d.byId.tasks[id]?.name ?? '—' },
            ]}
          />
        </>
      )}
    </div>
  )
}
