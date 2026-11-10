import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useV2Data } from '../../lib/v2/useV2Data'
import { commerceLeaves, buildTree, totals, UNALLOCATED } from '../../lib/v2/commerce'
import { UNKNOWN, monthPace } from '../../lib/v2/metrics'
import PlanFactTree from '../v2/PlanFactTree'
import KpiCards from '../v2/KpiCards'
import MultiSelect from '../Reports/MultiSelect'
import { currentMonth } from '../../lib/month'
import '../v2/v2.css'

export const COMMERCE_METRICS = [
  { key: 'budget', label: 'Вложения', fmt: 'money', lowerBetter: true, additive: true, hint: 'Расход кабинетов по дням + ручной расход' },
  { key: 'revenue', label: 'Выручка', fmt: 'money', additive: true },
  { key: 'sales', label: 'Продажи', fmt: 'num1', additive: true },
  { key: 'avg_check', label: 'Средний чек', fmt: 'money' },
  { key: 'roas', label: 'ROAS', fmt: 'ratio1', hint: 'Выручка ÷ вложения' },
  { key: 'cac', label: 'CAC', fmt: 'money', lowerBetter: true, hint: 'Вложения ÷ продажи' },
]

const MODES = [
  { key: 'task', label: 'Задача → источник' },
  { key: 'tasks', label: 'По задачам' },
  { key: 'sources', label: 'По источникам' },
]

function readMode() {
  try {
    return localStorage.getItem('com.mode') || 'task'
  } catch {
    return 'task'
  }
}

// Коммерция — top-manager level: brand → client task → demand source.
export default function CommercePage() {
  const [month, setMonth] = useState(currentMonth())
  const [branchId, setBranchId] = useState('')
  const [mode, setModeState] = useState(readMode())
  const [taskSel, setTaskSel] = useState([])
  const [sourceSel, setSourceSel] = useState([])
  const navigate = useNavigate()
  const d = useV2Data({ month, branchId: branchId || null })

  const setMode = (m) => {
    setModeState(m)
    try {
      localStorage.setItem('com.mode', m)
    } catch {
      /* ignore */
    }
  }

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
    [d.deals, d.events, d.plans, d.spend, d.spendBrands, d.stages]
  )
  // Multi-select slices over the same leaves (totals follow the selection).
  const leaves = useMemo(
    () =>
      allLeaves.filter(
        (l) => (!taskSel.length || taskSel.includes(l.task_id)) && (!sourceSel.length || sourceSel.includes(l.source_id))
      ),
    [allLeaves, taskSel, sourceSel]
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

  const pace = monthPace(month)
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

  return (
    <div>
      <div className="v2__controls">
        <label className="v2__ctrl">
          <span>Месяц</span>
          <input className="input" type="month" value={month.slice(0, 7)} onChange={(e) => setMonth(e.target.value + '-01')} />
        </label>
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
          <MultiSelect options={d.dict.sources.filter((x) => !x.is_archived)} value={sourceSel} onChange={setSourceSel} />
        </div>
        <div className="mx__group-toggle" style={{ marginLeft: 'auto' }}>
          {MODES.map((m) => (
            <button key={m.key} className={mode === m.key ? 'is-active' : ''} onClick={() => setMode(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {d.error && <p className="form-error">Не удалось загрузить: {d.error}</p>}

      {!d.loading && d.plans.length === 0 && (
        <div className="v2__banner">
          <span>План коммерции на этот месяц не утверждён — показан только факт.</span>
          <button className="btn btn--ghost" onClick={() => navigate('/planning')}>
            Перейти к планированию
          </button>
        </div>
      )}

      {d.loading ? (
        <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>
      ) : (
        <>
          <KpiCards items={kpis} pace={pace} />
          <PlanFactTree
            nodes={tree}
            metrics={COMMERCE_METRICS}
            label={label}
            firstColLabel={d.isAll ? 'Бренд / задача / источник' : mode === 'sources' ? 'Источник спроса' : 'Клиентская задача / источник'}
            storageKey="com.hidden"
            thresholds={{ low: 90, high: 100 }}
            pace={pace}
            canOpen={(n) => n.level === 'source_id' && n.id !== UNKNOWN}
            onRowClick={(n) => navigate(`/marketing/source/${n.id}?month=${month}`)}
          />
          <p className="v2__note">
            Факт — по когорте обращений месяца. Цвет объёмов в текущем месяце — по темпу: факт против плана
            на сегодняшний день. Вложения по задаче — доля расхода источника пропорционально
            квал-лидам задачи из этого источника (если квалов нет — по плановому бюджету). Источник спроса
            определяется по UTM с этапа «Обращение». Клик по источнику открывает его дашборд в Маркетинге.
          </p>
        </>
      )}
    </div>
  )
}
