import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from '../../context/SessionContext'
import { useToast } from '../common/Toast'
import PlanLifecycle, { GapList } from './PlanLifecycle'
import { loadKindPlan, createKindDraft, saveTarget, approveKindPlan, newKindVersion, copyKindFromPrevious } from '../../lib/api/plansV2'
import { loadCommercePlans, loadSalesStructure } from '../../lib/v2/loaders'
import { salesGaps, commerceTotalsOf } from '../../lib/v2/reconcile'
import { SALES_METRICS, UNIT_KINDS } from '../../lib/v2/sales'
import { can } from '../../lib/permissions'
import { fmtValue } from '../v2/PlanFactTree'

const DEPT_METRICS = ['sales', 'revenue', 'held']
const k = (u, p, m) => `${u || ''}|${p || ''}|${m}`

// Отдел продаж: план отдела → подотделы → личные планы сотрудников.
export default function SalesPlan({ month }) {
  const { profile, caps } = useSession()
  const toast = useToast()
  const actorId = profile?.id
  const canEdit = can(caps, ['edit_plan', 'sales_all'])
  const canApprove = can(caps, ['approve_plan', 'sales_all'])

  const [bundle, setBundle] = useState(null)
  const [vals, setVals] = useState({})
  const [structure, setStructure] = useState({ units: [], members: [], profiles: [] })
  const [commerce, setCommerce] = useState([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [b, s, c] = await Promise.all([loadKindPlan('sales', month), loadSalesStructure(), loadCommercePlans(month)])
    setBundle(b)
    setVals(Object.fromEntries((b?.lines ?? []).map((t) => [k(t.unit_id, t.profile_id, t.metric), String(t.value)])))
    setStructure(s)
    setCommerce(c)
    setLoading(false)
  }, [month])

  useEffect(() => {
    load()
  }, [load])

  const targets = useMemo(
    () =>
      Object.entries(vals)
        .filter(([, v]) => v !== '' && v != null && !Number.isNaN(Number(v)))
        .map(([key, v]) => {
          const [unit_id, profile_id, metric] = key.split('|')
          return { unit_id: unit_id || null, profile_id: profile_id || null, metric, value: Number(v) }
        }),
    [vals]
  )
  const totals = useMemo(() => commerceTotalsOf(commerce), [commerce])
  const gaps = useMemo(() => salesGaps({ targets, units: structure.units, commerceTotals: totals }), [targets, structure.units, totals])

  if (loading) return <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>

  const readOnly = !bundle || bundle.plan.status === 'approved' || !canEdit
  const name = (pid) => structure.profiles.find((p) => p.id === pid)?.full_name ?? '—'
  const run = (fn, msg) => async (...a) => {
    setBusy(true)
    try {
      await fn(...a)
      await load()
      if (msg) toast.show({ message: msg })
    } catch (e) {
      toast.show({ message: e.message })
    } finally {
      setBusy(false)
    }
  }
  const persist = (u, p, m) => () => {
    if (!bundle) return
    const raw = vals[k(u, p, m)]
    saveTarget(bundle.plan.id, u || null, p || null, m, raw === '' || raw == null ? null : Number(raw)).catch((e) => toast.show({ message: e.message }))
  }
  const cell = (u, p, m) =>
    readOnly ? (
      <span className="mono">{vals[k(u, p, m)] ? fmtValue(SALES_METRICS[m].fmt, Number(vals[k(u, p, m)])) : '—'}</span>
    ) : (
      <input
        className="input plan__input"
        type="number"
        value={vals[k(u, p, m)] ?? ''}
        onChange={(e) => setVals((s) => ({ ...s, [k(u, p, m)]: e.target.value }))}
        onBlur={persist(u, p, m)}
      />
    )
  const dept = (m) => (vals[k(null, null, m)] ? Number(vals[k(null, null, m)]) : null)

  return (
    <div>
      <div className="plan__levelbar">
        <span className="plan__levelhint">
          Отдел продаж общий для брендов · из Коммерции (все бренды): продажи{' '}
          <b className="mono">{totals ? fmtValue('num1', totals.orders) : '—'}</b>, выручка{' '}
          <b className="mono">{totals ? fmtValue('money', totals.revenue) : '—'}</b>
        </span>
        <PlanLifecycle
          bundle={bundle}
          canEdit={canEdit}
          canApprove={canApprove}
          busy={busy}
          gaps={gaps}
          summary={[
            { label: 'Продажи отдела', value: dept('sales'), fmt: 'int' },
            { label: 'Выручка отдела', value: dept('revenue'), fmt: 'money' },
            { label: 'Встречи', value: dept('held'), fmt: 'int' },
          ]}
          onCreate={run(() => createKindDraft('sales', month, null, actorId), 'Черновик плана отдела создан.')}
          onCopy={run(() => copyKindFromPrevious('sales', month, null, actorId), 'Скопирован план прошлого месяца.')}
          onApprove={run((reason) => approveKindPlan(bundle.plan, actorId, reason), 'План отдела продаж утверждён.')}
          onNewVersion={run(() => newKindVersion('sales', month, null, actorId), 'Создана новая версия — внесите правки и утвердите.')}
        />
      </div>

      <GapList gaps={gaps} title="Люди ↔ подотделы ↔ отдел ↔ Коммерция" />

      {bundle && (
        <>
          <div className="rep__table-wrap">
            <table className="rep__table plan__table">
              <thead>
                <tr>
                  <th className="plan__sticky-col">Отдел продаж</th>
                  {DEPT_METRICS.map((m) => (
                    <th key={m}>{SALES_METRICS[m].label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="plan__task-row">
                  <td className="plan__sticky-col plan__task-name">План отдела</td>
                  {DEPT_METRICS.map((m) => (
                    <td key={m} className="plan__num">
                      {cell(null, null, m)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {structure.units.map((u) => {
            const metrics = (u.kpi || []).filter((m) => SALES_METRICS[m]?.additive)
            const memberIds = structure.members.filter((m) => m.unit_id === u.id).map((m) => m.profile_id)
            if (!metrics.length) return null
            return (
              <div key={u.id} className="rep__table-wrap">
                <table className="rep__table plan__table">
                  <thead>
                    <tr>
                      <th className="plan__sticky-col">
                        {u.name} <span className="settings__brand">{UNIT_KINDS[u.kind]}</span>
                      </th>
                      {metrics.map((m) => (
                        <th key={m}>{SALES_METRICS[m].label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="plan__task-row">
                      <td className="plan__sticky-col plan__task-name">План подотдела</td>
                      {metrics.map((m) => (
                        <td key={m} className="plan__num">
                          {cell(u.id, null, m)}
                        </td>
                      ))}
                    </tr>
                    {memberIds.map((pid) => (
                      <tr key={pid} className="plan__source-row">
                        <td className="plan__sticky-col plan__source-name">{name(pid)}</td>
                        {metrics.map((m) => (
                          <td key={m} className="plan__num">
                            {cell(u.id, pid, m)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="plan__grand">
                      <td className="plan__sticky-col">Сумма сотрудников</td>
                      {metrics.map((m) => {
                        const sum = memberIds.reduce((a, pid) => a + (Number(vals[k(u.id, pid, m)]) || 0), 0)
                        const unitV = vals[k(u.id, null, m)]
                        const bad = unitV !== undefined && unitV !== '' && Math.abs(Number(unitV) - sum) > (SALES_METRICS[m].fmt === 'money' ? 1 : 0.5)
                        return (
                          <Fragment key={m}>
                            <td className={`plan__num mono ${bad ? 'plan__bad' : ''}`}>{fmtValue(SALES_METRICS[m].fmt, sum)}</td>
                          </Fragment>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          })}
        </>
      )}
      <p className="v2__note">
        Лид-центр отвечает за проведённые встречи, отдел продаж в целом — за план по продажам. Пусто в «Плане подотдела» —
        значит его план равен сумме сотрудников. Продажи отдела = продажи консультаций + повторные продажи аккаунт-менеджеров.
      </p>
    </div>
  )
}
