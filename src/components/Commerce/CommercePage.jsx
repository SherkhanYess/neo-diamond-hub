import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useV2Data } from '../../lib/v2/useV2Data'
import { commerceLeaves, buildTree, totals, UNALLOCATED } from '../../lib/v2/commerce'
import { UNKNOWN } from '../../lib/v2/metrics'
import { periodPace } from '../../lib/v2/period'
import { usePeriod } from '../../context/PeriodContext'
import PeriodPicker from '../v2/PeriodPicker'
import CycleBlock, { useClosedSales } from '../v2/CycleBlock'
import PlanFactTree from '../v2/PlanFactTree'
import KpiCards from '../v2/KpiCards'
import MultiSelect from '../Reports/MultiSelect'
import PulseTable from '../v2/PulseTable'
import { funnelRows, commerceRows, plannedStageCounts, spendByDay } from '../../lib/v2/pulse'
import { loadMarketingPlan } from '../../lib/v2/loaders'
import '../v2/v2.css'

export const COMMERCE_METRICS = [
  {
    key: 'budget',
    label: 'Вложения',
    fmt: 'money',
    lowerBetter: true,
    additive: true,
    hint: 'Расход кабинетов по дням + ручной расход',
  },
  { key: 'revenue', label: 'Выручка', fmt: 'money', additive: true },
  { key: 'sales', label: 'Продажи', fmt: 'num1', additive: true },
  { key: 'avg_check', label: 'Средний чек', fmt: 'money' },
  { key: 'roas', label: 'ROAS', fmt: 'ratio1', hint: 'Выручка ÷ вложения' },
  {
    key: 'cac',
    label: 'CAC',
    fmt: 'money',
    lowerBetter: true,
    hint: 'Вложения ÷ продажи',
  },
]

const MODES = [
  { key: 'task', label: 'Задача → источник' },
  { key: 'tasks', label: 'По задачам' },
  { key: 'sources', label: 'По источникам' },
]

const VIEWS = [
  { key: 'general', label: 'Общий' },
  { key: 'rnp', label: 'РнП' },
]

function readLs(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}
function writeLs(key, v) {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* ignore */
  }
}

// Коммерция — top-manager level: brand → client task → demand source.
export default function CommercePage() {
  const { period } = usePeriod()
  const [basis, setBasisState] = useState(readLs('com.rnp.basis', 'stage'))
  const setBasis = (b) => {
    setBasisState(b)
    writeLs('com.rnp.basis', b)
  }
  const [branchId, setBranchId] = useState('')
  const [mode, setModeState] = useState(readLs('com.mode', 'task'))
  const [view, setViewState] = useState(readLs('com.view', 'general'))
  const [mktPlan, setMktPlan] = useState([])
  const [taskSel, setTaskSel] = useState([])
  const [sourceSel, setSourceSel] = useState([])
  const navigate = useNavigate()
  const d = useV2Data({ period, branchId: branchId || null })
  const closed = useClosedSales(period, { brandId: d.brandId, branchId: branchId || null })

  const setMode = (m) => {
    setModeState(m)
    writeLs('com.mode', m)
  }
  const setView = (v) => {
    setViewState(v)
    writeLs('com.view', v)
  }

  useEffect(() => {
    loadMarketingPlan(period, d.brandId)
      .then(setMktPlan)
      .catch(() => setMktPlan([]))
  }, [period, d.brandId])

  const allLeaves = useMemo(
    () =>
      commerceLeaves({
        deals: d.deals,
        events: d.events,
        plans: d.plans,
        spendBySource: d.spend.bySource,
        spendBrands: d.spendBrands,
        stages: d.stages,
      }),
    [d.deals, d.events, d.plans, d.spend, d.spendBrands, d.stages],
  )
  // Multi-select slices over the same leaves (totals follow the selection).
  const leaves = useMemo(
    () =>
      allLeaves.filter(
        (l) =>
          (!taskSel.length || taskSel.includes(l.task_id)) && (!sourceSel.length || sourceSel.includes(l.source_id)),
      ),
    [allLeaves, taskSel, sourceSel],
  )

  const levels = useMemo(() => {
    const tail = mode === 'task' ? ['task_id', 'source_id'] : mode === 'tasks' ? ['task_id'] : ['source_id']
    return d.isAll ? ['brand_id', ...tail] : tail
  }, [mode, d.isAll])

  const tree = useMemo(() => buildTree(leaves, levels), [leaves, levels])
  const t = useMemo(() => totals(leaves), [leaves])

  const label = (n) => {
    if (n.level === 'brand_id') return d.byId.brands[n.id]?.name ?? '—'
    if (n.level === 'task_id') {
      if (n.id === UNKNOWN) return 'Задача не определена (до квалификации)'
      if (n.id === UNALLOCATED) return 'Вне задач (расход без квал-лидов)'
      return d.byId.tasks[n.id]?.name ?? '—'
    }
    if (n.id === UNKNOWN) return 'Источник не определён'
    return d.byId.sources[n.id]?.name ?? '—'
  }

  const pace = periodPace(period)
  const kpis = COMMERCE_METRICS.map((m) => ({
    key: m.key,
    label: m.label,
    fmt: m.fmt,
    lowerBetter: m.lowerBetter,
    additive: m.additive,
    hint: m.hint,
    plan: t.planM[m.key],
    fact: t.factM[m.key],
  }))

  const inSel = (sel, v) => !sel.length || sel.includes(v)
  const rnp = useMemo(() => {
    if (view !== 'rnp') return []
    const deals = d.deals.filter(
      (x) => inSel(taskSel, x.client_task_id ?? UNKNOWN) && inSel(sourceSel, x.demand_source_id ?? UNKNOWN),
    )
    const hasPlan = d.plans.length > 0
    // Planned sales per plan within the selection → stage counts via its conversions.
    const plansSel = d.plans.map((p) => ({
      conversions: p.conversions,
      orders: (p.computed?.rows || [])
        .filter((r) => inSel(taskSel, r.client_task_id) && inSel(sourceSel, r.demand_source_id))
        .reduce((a, r) => a + (Number(r.orders) || 0), 0),
    }))
    const explicit = {}
    if (hasPlan && d.stages.sale) explicit[d.stages.sale] = t.plan.sales
    // Marketing plan knows leads and quals per converter (no task split).
    if (!taskSel.length && mktPlan.length) {
      const lines = mktPlan.filter((l) => inSel(sourceSel, d.byId.converters[l.converter_id]?.demand_source_id))
      if (lines.length) {
        if (d.stages.first) explicit[d.stages.first] = lines.reduce((a, l) => a + Number(l.leads), 0)
        if (d.stages.qual) explicit[d.stages.qual] = lines.reduce((a, l) => a + Number(l.quals), 0)
      }
    }
    const funnel = funnelRows({
      deals,
      events: d.events,
      orderedStages: d.dict.stages,
      stagePlans: plannedStageCounts(plansSel, d.dict.stages, explicit),
      revenuePlan: hasPlan ? t.plan.revenue : null,
      basis,
    })
    const byDay = spendByDay(
      d.adStats.filter((r) => inSel(sourceSel, r.demand_source_id ?? UNKNOWN)),
      d.manual.filter((r) => inSel(sourceSel, r.demand_source_id ?? UNKNOWN)),
    )
    const daySum = [...byDay.values()].reduce((a, v) => a + v, 0)
    const factBudget = t.factM.budget
    return commerceRows({
      funnel,
      qualStageId: d.stages.qual,
      budget: {
        plan: hasPlan ? t.plan.budget : null,
        fact: factBudget,
        byDay,
        scale: daySum > 0 && factBudget != null ? factBudget / daySum : 1,
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    view,
    d.deals,
    d.events,
    d.plans,
    d.adStats,
    d.manual,
    d.dict.stages,
    d.stages,
    d.byId,
    mktPlan,
    taskSel,
    sourceSel,
    t,
    basis,
  ])

  return (
    <div>
      <div className="rep__tabs" style={{ marginBottom: 'var(--space-3)' }}>
        {VIEWS.map((v) => (
          <button key={v.key} className={view === v.key ? 'is-active' : ''} onClick={() => setView(v.key)}>
            {v.label}
          </button>
        ))}
      </div>
      <div className="v2__controls">
        <div className="v2__ctrl">
          <span>Период</span>
          <PeriodPicker />
        </div>
        <label className="v2__ctrl">
          <span>Филиал</span>
          <select className="select" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Все филиалы</option>
            {d.dict.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <div className="v2__ctrl">
          <span>Клиентские задачи</span>
          <MultiSelect options={d.dict.tasks.filter((x) => !x.is_archived)} value={taskSel} onChange={setTaskSel} />
        </div>
        <div className="v2__ctrl">
          <span>Источники спроса</span>
          <MultiSelect
            options={d.dict.sources.filter((x) => !x.is_archived)}
            value={sourceSel}
            onChange={setSourceSel}
          />
        </div>
        {view === 'general' && (
          <div className="mx__group-toggle" style={{ marginLeft: 'auto' }}>
            {MODES.map((m) => (
              <button key={m.key} className={mode === m.key ? 'is-active' : ''} onClick={() => setMode(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {d.error && <p className="form-error">Не удалось загрузить: {d.error}</p>}

      {!d.loading && d.plans.length === 0 && (
        <div className="v2__banner">
          <span>План коммерции на месяцы периода не утверждён — показан только факт.</span>
          <button className="btn btn--ghost" onClick={() => navigate('/planning')}>
            Перейти к планированию
          </button>
        </div>
      )}

      {d.loading ? (
        <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>
      ) : view === 'rnp' ? (
        <PulseTable
          rows={rnp}
          period={period}
          pace={pace}
          basis={basis}
          onBasis={setBasis}
          storageKey="com.rnp.hidden"
          note="Вложения — расход кабинетов и ручной расход по дням; при выборе задач — их доля расхода источника (по квал-лидам). План воронки — из плана маркетинга (обращения, квалы) и конверсий плана коммерции; продажи и выручка — из плана коммерции."
        />
      ) : (
        <>
          <KpiCards items={kpis} pace={pace} />
          <PlanFactTree
            nodes={tree}
            metrics={COMMERCE_METRICS}
            label={label}
            firstColLabel={
              d.isAll
                ? 'Бренд / задача / источник'
                : mode === 'sources'
                  ? 'Источник спроса'
                  : 'Клиентская задача / источник'
            }
            storageKey="com.hidden"
            thresholds={{ low: 90, high: 100 }}
            pace={pace}
            canOpen={(n) => n.level === 'source_id' && n.id !== UNKNOWN}
            onRowClick={(n) => navigate(`/marketing/source/${n.id}`)}
          />
          <p className="v2__note">
            Факт — по когорте обращений периода (уникальные лиды; повторные обращения — отдельно). План — месячный,
            пропорционально дням периода. Цвет объёмов в текущем периоде — по темпу: факт против плана на сегодня. Вложения по задаче — доля расхода источника пропорционально квал-лидам задачи из этого
            источника (если квалов нет — по плановому бюджету). Источник спроса определяется по UTM с этапа «Обращение».
            Клик по источнику открывает его дашборд в Маркетинге.
          </p>
          <CycleBlock
            deals={closed.deals.filter(
              (x) =>
                (!taskSel.length || taskSel.includes(x.client_task_id ?? UNKNOWN)) &&
                (!sourceSel.length || sourceSel.includes(x.demand_source_id ?? UNKNOWN)),
            )}
            loading={closed.loading}
            error={closed.error}
            groups={[
              { key: 'task', label: 'По клиентским задачам', keyOf: (x) => x.client_task_id, nameOf: (id) => d.byId.tasks[id]?.name ?? '—' },
              { key: 'source', label: 'По источникам спроса', keyOf: (x) => x.demand_source_id, nameOf: (id) => d.byId.sources[id]?.name ?? '—' },
              { key: 'city', label: 'По городам', keyOf: (x) => closed.cities[x.branch_id]?.id, nameOf: (id) => Object.values(closed.cities).find((c) => c.id === id)?.name ?? '—' },
            ]}
          />
        </>
      )}
    </div>
  )
}
