import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { useV2Data } from '../../lib/v2/useV2Data'
import { commerceLeaves, buildTree, totals, UNALLOCATED } from '../../lib/v2/commerce'
import { UNKNOWN, monthPace, reachedStages } from '../../lib/v2/metrics'
import { departmentReport, SALES_METRICS } from '../../lib/v2/sales'
import { loadSalesStructure, loadSalesTargets } from '../../lib/v2/loaders'
import { listDecisions, isOverdue } from '../../lib/api/decisions'
import { salesScope, can } from '../../lib/permissions'
import { currentMonth } from '../../lib/month'
import { fmtValue } from '../v2/PlanFactTree'
import { FunnelChart, BarCompare, ProgressRing } from './Charts'
import { money } from '../../lib/format'
import EmptyState from '../common/EmptyState'
import './Dashboard.css'
import '../v2/v2.css'

const WIDGETS = [
  { key: 'revenue', label: 'Выполнение плана выручки' },
  { key: 'metrics', label: 'Ключевые метрики' },
  { key: 'funnel', label: 'Мини-воронка' },
  { key: 'sources', label: 'Выручка по источникам спроса' },
  { key: 'tasks', label: 'Выручка по клиентским задачам' },
  { key: 'units', label: 'Подотделы продаж' },
  { key: 'deviations', label: 'Главные отклонения' },
  { key: 'decisions', label: 'Решения на проверку' },
]

// Default set by role: marketing sees sources and deviations, sales the
// funnel and units, the owner everything.
function defaultWidgets(caps) {
  if (can(caps, 'settings')) return WIDGETS.map((w) => w.key)
  const sales = salesScope(caps) && can(caps, ['sales_all', 'sales_unit', 'sales_self'])
  if (sales) return ['revenue', 'funnel', 'units', 'decisions']
  return ['revenue', 'metrics', 'sources', 'tasks', 'deviations', 'decisions']
}

const STORAGE = 'dash.widgets'

export default function DashboardPage() {
  const { caps } = useSession()
  const navigate = useNavigate()
  const [month, setMonth] = useState(currentMonth())
  const [branchId, setBranchId] = useState('')
  const [shown, setShown] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE) || 'null')
      return Array.isArray(v) ? v : defaultWidgets(caps)
    } catch {
      return defaultWidgets(caps)
    }
  })
  const [pick, setPick] = useState(false)
  const [decisions, setDecisions] = useState([])
  const [sales, setSales] = useState({ units: [], members: [], targets: [] })
  const d = useV2Data({ month, branchId: branchId || null })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(shown))
    } catch {
      /* ignore */
    }
  }, [shown])
  useEffect(() => {
    listDecisions().then(setDecisions).catch(() => setDecisions([]))
  }, [])
  useEffect(() => {
    Promise.all([loadSalesStructure(), loadSalesTargets(month)]).then(([s, t]) =>
      setSales({ units: s.units, members: s.members, targets: t.targets })
    )
  }, [month])

  const leaves = useMemo(
    () =>
      commerceLeaves({
        deals: d.deals,
        events: d.events,
        plans: d.plans,
        spendBySource: d.spend.bySource,
        spendBrands: d.spendBrands,
        stages: d.stages,
      }),
    [d.deals, d.events, d.plans, d.spend, d.spendBrands, d.stages]
  )
  const t = useMemo(() => totals(leaves), [leaves])
  const bySource = useMemo(() => buildTree(leaves, ['source_id']), [leaves])
  const byTask = useMemo(() => buildTree(leaves, ['task_id']), [leaves])
  const pace = monthPace(month)

  const funnelRows = useMemo(() => {
    const reached = reachedStages(d.events)
    const core = d.dict.stages.filter((s) => s.sort_order <= (d.dict.stages.find((x) => x.is_sale)?.sort_order ?? 99))
    return core.map((s) => ({
      stage_id: s.id,
      name: s.name,
      fact: d.deals.filter((x) => reached.get(x.id)?.has(s.id)).length,
      plan: null,
    }))
  }, [d.deals, d.events, d.dict.stages])

  const deviations = useMemo(
    () =>
      leaves
        .filter((l) => l.plan.revenue > 0 && l.task_id !== UNKNOWN && l.task_id !== UNALLOCATED)
        .map((l) => ({ ...l, gap: l.fact.revenue - l.plan.revenue * (pace || 1) }))
        .sort((a, b) => a.gap - b.gap)
        .slice(0, 5),
    [leaves, pace]
  )

  const dept = useMemo(
    () => departmentReport({ units: sales.units, members: sales.members, deals: d.deals, events: d.events, stages: d.stages, targets: sales.targets }),
    [sales, d.deals, d.events, d.stages]
  )
  const overdue = decisions.filter((x) => isOverdue(x))

  const planRev = t.plan.revenue
  const factRev = t.fact.revenue
  const forecast = pace > 0 ? factRev / pace : factRev
  const has = (k) => shown.includes(k)
  const name = {
    task: (id) => (id === UNKNOWN ? 'Задача не определена' : d.byId.tasks[id]?.name ?? '—'),
    source: (id) => (id === UNKNOWN ? 'Источник не определён' : d.byId.sources[id]?.name ?? '—'),
  }

  return (
    <div className="dash">
      <div className="dash__controls">
        <input className="input" type="month" value={month.slice(0, 7)} onChange={(e) => setMonth(e.target.value + '-01')} />
        <select className="select" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">Все филиалы</option>
          {d.dict.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <div className="colpick" style={{ marginLeft: 'auto' }}>
          <button className="btn btn--ghost" onClick={() => setPick((p) => !p)}>
            Виджеты
          </button>
          {pick && (
            <div className="colpick__menu" onMouseLeave={() => setPick(false)}>
              {WIDGETS.map((w) => (
                <label key={w.key}>
                  <input
                    type="checkbox"
                    checked={has(w.key)}
                    onChange={() => setShown((s) => (s.includes(w.key) ? s.filter((x) => x !== w.key) : [...s, w.key]))}
                  />
                  {w.label}
                </label>
              ))}
              <button className="crud__link" onClick={() => setShown(defaultWidgets(caps))}>
                Как у моей роли
              </button>
            </div>
          )}
        </div>
      </div>

      {d.loading ? (
        <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>
      ) : !d.deals.length && !d.plans.length ? (
        <EmptyState
          title="Нет данных за период"
          description="Утвердите план коммерции и дождитесь сделок из CRM."
          action={
            <button className="btn btn--primary" onClick={() => navigate('/planning')}>
              Перейти к планированию
            </button>
          }
        />
      ) : (
        <div className="dash__grid">
          {has('revenue') && (
            <button className="dash__card dash__card--wide dash__card--split" onClick={() => navigate('/commerce')}>
              <div>
                <span className="eyebrow">Выполнение плана выручки</span>
                <div className="dash__big mono">{money(factRev)}</div>
                <div className="dash__row">
                  <span>План</span>
                  <b className="mono">{planRev ? money(planRev) : '—'}</b>
                </div>
                <div className="dash__row">
                  <span>Прогноз на конец месяца при текущем темпе</span>
                  <b className="mono">{money(forecast)}</b>
                </div>
              </div>
              {planRev > 0 && <ProgressRing pct={(factRev / planRev) * 100} label="выполнено" />}
            </button>
          )}

          {has('metrics') && (
            <button className="dash__card" onClick={() => navigate('/commerce')}>
              <span className="eyebrow">Ключевые метрики</span>
              <div className="dash__row"><span>Продажи (факт / план)</span><b className="mono">{fmtValue('int', t.fact.sales)} / {t.plan.sales ? fmtValue('num1', t.plan.sales) : '—'}</b></div>
              <div className="dash__row"><span>Средний чек</span><b className="mono">{fmtValue('money', t.factM.avg_check)}</b></div>
              <div className="dash__row"><span>Вложения</span><b className="mono">{fmtValue('money', t.factM.budget)}</b></div>
              <div className="dash__row"><span>CAC (план {fmtValue('money', t.planM.cac)})</span><b className="mono">{fmtValue('money', t.factM.cac)}</b></div>
              <div className="dash__row"><span>ROAS (план {fmtValue('ratio1', t.planM.roas)})</span><b className="mono">{fmtValue('ratio1', t.factM.roas)}</b></div>
            </button>
          )}

          {has('funnel') && (
            <button className="dash__card dash__card--wide" onClick={() => navigate('/sales')}>
              <span className="eyebrow">Мини-воронка</span>
              <FunnelChart rows={funnelRows} />
            </button>
          )}

          {has('sources') && (
            <button className="dash__card" onClick={() => navigate('/marketing')}>
              <span className="eyebrow">Выручка по источникам спроса</span>
              <BarCompare
                items={bySource
                  .filter((n) => n.plan.revenue || n.fact.revenue)
                  .map((n) => ({ key: n.id, label: name.source(n.id), plan: n.plan.revenue, fact: n.fact.revenue }))}
              />
            </button>
          )}

          {has('tasks') && (
            <button className="dash__card" onClick={() => navigate('/commerce')}>
              <span className="eyebrow">Выручка по клиентским задачам</span>
              <BarCompare
                items={byTask
                  .filter((n) => (n.plan.revenue || n.fact.revenue) && n.id !== UNALLOCATED)
                  .map((n) => ({ key: n.id, label: name.task(n.id), plan: n.plan.revenue, fact: n.fact.revenue }))}
              />
            </button>
          )}

          {has('units') && dept.units.length > 0 && (
            <button className="dash__card" onClick={() => navigate('/sales')}>
              <span className="eyebrow">Подотделы продаж · ЦКП</span>
              {dept.units.map((u) => {
                const ckp = u.unit.kpi?.[0]
                const meta = SALES_METRICS[ckp]
                return (
                  <div className="dash__row" key={u.unit.id}>
                    <span>
                      {u.unit.name} · {meta?.label}
                    </span>
                    <b className="mono">
                      {fmtValue(meta?.fmt, u.total.fact[ckp])}
                      {u.total.plan[ckp] != null ? ` / ${fmtValue(meta?.fmt, u.total.plan[ckp])}` : ''}
                    </b>
                  </div>
                )
              })}
            </button>
          )}

          {has('deviations') && (
            <div className="dash__card dash__card--wide">
              <span className="eyebrow">Главные отклонения (от плана на сегодня)</span>
              {deviations.length === 0 && <p className="dash__empty">План не утверждён</p>}
              {deviations.map((r) => (
                <button
                  key={`${r.brand_id}${r.task_id}${r.source_id}`}
                  className="dash__row dash__rowbtn"
                  onClick={() => navigate(`/marketing/source/${r.source_id}?month=${month}`)}
                >
                  <span>
                    {d.isAll ? `${d.byId.brands[r.brand_id]?.name ?? ''} · ` : ''}
                    {name.task(r.task_id)} · {name.source(r.source_id)}
                  </span>
                  <b className={`mono ${r.gap < 0 ? 'dash__neg' : 'dash__pos'}`}>
                    {r.gap >= 0 ? '+' : ''}
                    {money(r.gap)}
                  </b>
                </button>
              ))}
            </div>
          )}

          {has('decisions') && (
            <button className="dash__card" onClick={() => navigate('/decisions')}>
              <span className="eyebrow">Решения на проверку</span>
              {overdue.length === 0 && <p className="dash__empty">Просроченных нет</p>}
              {overdue.slice(0, 5).map((x) => (
                <div className="dash__row" key={x.id}>
                  <span>{x.hypothesis || x.metric_name || 'Решение'}</span>
                  <b className="dash__neg">{x.check_date ? new Date(x.check_date).toLocaleDateString('ru-RU') : ''}</b>
                </div>
              ))}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
