import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSession } from '../../context/SessionContext'
import { useToast } from '../common/Toast'
import ConfirmDialog from '../common/ConfirmDialog'
import EmptyState from '../common/EmptyState'
import MarketingSheet from './MarketingSheet'
import SalesSheet from './SalesSheet'
import { listRef } from '../../lib/api/references'
import {
  loadLatestPlan,
  createDraft,
  saveTaskLine,
  saveSourceLine,
  saveConversion,
  approvePlan,
  createNewVersion,
  copyPreviousMonth,
} from '../../lib/api/planning'
import { buildTasks, buildConversionPairs } from '../../lib/planning/buildWorkingState'
import { computeMarketing, validateShares } from '../../lib/planning/calc'
import { money, num1, ratio1 } from '../../lib/format'
import './PlanningPage.css'

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function PlanningPage() {
  const { profile, caps } = useSession()
  const actorId = profile?.id
  const toast = useToast()
  const canApprove = caps.includes('approve_plan')
  const canEdit = caps.includes('edit_plan')

  const [branches, setBranches] = useState([])
  const [clientTasks, setClientTasks] = useState([])
  const [demandSources, setDemandSources] = useState([])
  const [stages, setStages] = useState([])

  const [month, setMonth] = useState(currentMonth())
  const [branchId, setBranchId] = useState('')
  const [bundle, setBundle] = useState(null)
  const [tasks, setTasks] = useState([])
  const [pairs, setPairs] = useState([])
  const [orderedStages, setOrderedStages] = useState([])
  const [sheet, setSheet] = useState('marketing')
  const [loading, setLoading] = useState(false)
  // Mirrors of editable state so edit handlers never read a stale closure.
  const tasksRef = useRef([])
  const pairsRef = useRef([])
  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])
  useEffect(() => {
    pairsRef.current = pairs
  }, [pairs])
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [reason, setReason] = useState('')

  // Load reference data once.
  useEffect(() => {
    Promise.all([listRef('branches'), listRef('client_tasks'), listRef('demand_sources'), listRef('funnel_stages')]).then(
      ([b, t, s, f]) => {
        setBranches(b)
        setClientTasks(t)
        setDemandSources(s)
        setStages(f)
        if (b.length && !branchId) setBranchId(b[0].id)
      }
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rebuild = useCallback(
    (b) => {
      setTasks(buildTasks(clientTasks, demandSources, b))
      const { ordered, pairs } = buildConversionPairs(stages, b)
      setOrderedStages(ordered)
      setPairs(pairs)
    },
    [clientTasks, demandSources, stages]
  )

  const reload = useCallback(async () => {
    if (!branchId || !clientTasks.length) return
    setLoading(true)
    try {
      const b = await loadLatestPlan(branchId, month)
      setBundle(b)
      rebuild(b)
    } finally {
      setLoading(false)
    }
  }, [branchId, month, clientTasks.length, rebuild])

  useEffect(() => {
    reload()
  }, [reload])

  const readOnly = !bundle || bundle.plan.status === 'approved' || !canEdit

  const sourcesById = useMemo(() => Object.fromEntries(demandSources.map((s) => [s.id, s])), [demandSources])

  // --- editing handlers (read fresh state from refs, then persist) ---
  const editTask = (taskId, field, value) => {
    const next = tasksRef.current.map((t) => (t.client_task_id === taskId ? { ...t, [field]: value } : t))
    tasksRef.current = next
    setTasks(next)
    const t = next.find((x) => x.client_task_id === taskId)
    saveTaskLine(bundle.plan.id, taskId, {
      target_revenue: Number(t.target_revenue) || 0,
      ad_budget_pct: Number(t.ad_budget_pct) || 0,
    })
  }

  const editSource = (taskId, sourceId, field, value) => {
    const next = tasksRef.current.map((t) =>
      t.client_task_id === taskId
        ? { ...t, sources: t.sources.map((s) => (s.demand_source_id === sourceId ? { ...s, [field]: value } : s)) }
        : t
    )
    tasksRef.current = next
    setTasks(next)
    const s = next.find((x) => x.client_task_id === taskId).sources.find((x) => x.demand_source_id === sourceId)
    saveSourceLine(bundle.plan.id, taskId, sourceId, {
      revenue_share: Number(s.revenue_share) || 0,
      avg_check: Number(s.avg_check) || 0,
      ad_budget: s.ad_budget === '' || s.ad_budget === null || s.ad_budget === undefined ? null : Number(s.ad_budget),
      owner_id: s.owner_id,
    })
  }

  const editConversion = (fromId, toId, value) => {
    const rate = Number(value) || 0
    const next = pairsRef.current.map((p) =>
      p.from_stage_id === fromId && p.to_stage_id === toId ? { ...p, rate } : p
    )
    pairsRef.current = next
    setPairs(next)
    saveConversion(bundle.plan.id, fromId, toId, rate)
  }

  // --- actions ---
  const startDraft = async () => {
    setLoading(true)
    try {
      const b = await createDraft(branchId, month, actorId)
      setBundle(b)
      rebuild(b)
      toast.show({ message: 'Черновик создан.' })
    } finally {
      setLoading(false)
    }
  }

  const copyPrev = async () => {
    setLoading(true)
    try {
      const b = await copyPreviousMonth(branchId, month, actorId)
      setBundle(b)
      rebuild(b)
      toast.show({ message: 'План прошлого месяца скопирован в черновик.' })
    } catch (e) {
      toast.show({ message: e.message })
    } finally {
      setLoading(false)
    }
  }

  const sharesCheck = validateShares(tasks)
  const totals = computeMarketing(tasks).grandTotal

  const doApprove = async () => {
    if (!sharesCheck.valid) {
      toast.show({ message: 'Доли источников внутри задачи должны давать 100%.' })
      return
    }
    if (bundle.plan.version > 1 && !reason.trim()) {
      toast.show({ message: 'Укажите причину изменения плана.' })
      return
    }
    await approvePlan(bundle, tasks, actorId, reason.trim() || null)
    setConfirmApprove(false)
    setReason('')
    await reload()
    toast.show({ message: 'План утверждён.' })
  }

  const changePlan = async () => {
    setLoading(true)
    try {
      const b = await createNewVersion(branchId, month, actorId)
      setBundle(b)
      rebuild(b)
      toast.show({ message: `Создана версия ${b.plan.version}. Внесите правки и утвердите.` })
    } finally {
      setLoading(false)
    }
  }

  const statusLabel = !bundle
    ? '—'
    : bundle.plan.status === 'approved'
      ? `Утверждён · версия ${bundle.plan.version}`
      : `Черновик${bundle.plan.version > 1 ? ` · версия ${bundle.plan.version}` : ''}`

  return (
    <div className="plan">
      <div className="plan__controls">
        <label className="plan__ctrl">
          <span>Месяц</span>
          <input className="input" type="month" value={month.slice(0, 7)} onChange={(e) => setMonth(e.target.value + '-01')} />
        </label>
        <label className="plan__ctrl">
          <span>Филиал</span>
          <select className="select" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <span className="plan__status">{statusLabel}</span>
      </div>

      {loading && <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>}

      {!loading && !bundle && (
        <EmptyState
          title="План на этот месяц не заведён"
          description="Создайте новый план или скопируйте прошлый месяц."
          action={
            canEdit ? (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn--primary" onClick={startDraft}>
                  Создать план
                </button>
                <button className="btn btn--ghost" onClick={copyPrev}>
                  Скопировать прошлый месяц
                </button>
              </div>
            ) : null
          }
        />
      )}

      {!loading && bundle && (
        <>
          <div className="plan__sheet-tabs">
            <button className={sheet === 'marketing' ? 'is-active' : ''} onClick={() => setSheet('marketing')}>
              Маркетинг
            </button>
            <button className={sheet === 'sales' ? 'is-active' : ''} onClick={() => setSheet('sales')}>
              Продажи
            </button>
          </div>

          {sheet === 'marketing' ? (
            <MarketingSheet
              tasks={tasks}
              sourcesById={sourcesById}
              onEditTask={editTask}
              onEditSource={editSource}
              readOnly={readOnly}
            />
          ) : (
            <SalesSheet
              tasks={tasks}
              orderedStages={orderedStages}
              pairs={pairs}
              onEditConversion={editConversion}
              readOnly={readOnly}
            />
          )}

          <div className="plan__actionbar">
            {!sharesCheck.valid && bundle.plan.status === 'draft' && (
              <span className="plan__warn">Доли источников ≠ 100% в некоторых задачах — утвердить нельзя.</span>
            )}
            {bundle.plan.status === 'draft' && canApprove && (
              <button className="btn btn--primary" disabled={!sharesCheck.valid} onClick={() => setConfirmApprove(true)}>
                Утвердить
              </button>
            )}
            {bundle.plan.status === 'approved' && canEdit && (
              <button className="btn btn--ghost" onClick={changePlan}>
                Изменить план
              </button>
            )}
          </div>
        </>
      )}

      {confirmApprove && (
        <div className="confirm__backdrop" onClick={() => setConfirmApprove(false)}>
          <div className="confirm" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm__title">Утвердить план?</h3>
            <ul className="plan__summary">
              <li>Выручка: <b>{money(totals.revenue)}</b></li>
              <li>Рекл. бюджет: <b>{money(totals.ad_budget)}</b></li>
              <li>Заказы: <b>{num1(totals.orders)}</b></li>
              <li>CAC: <b>{money(totals.cac)}</b></li>
              <li>ROAS: <b>{ratio1(totals.roas)}</b></li>
            </ul>
            {bundle.plan.version > 1 && (
              <div className="field">
                <label>Причина изменения (обязательно)</label>
                <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            )}
            <div className="confirm__actions">
              <button className="btn btn--ghost" onClick={() => setConfirmApprove(false)}>
                Отмена
              </button>
              <button className="btn btn--primary" onClick={doApprove}>
                Утвердить оба листа
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
