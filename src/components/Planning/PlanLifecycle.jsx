import { useState } from 'react'
import { fmtValue } from '../v2/PlanFactTree'

// Status + actions of one versioned plan. Approving shows the totals and any
// unresolved top-down gaps; a version > 1 must carry a reason.
export default function PlanLifecycle({ bundle, canEdit, canApprove, summary = [], gaps = [], onCreate, onCopy, onApprove, onNewVersion, busy }) {
  const [confirm, setConfirm] = useState(false)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState(null)
  const plan = bundle?.plan

  if (!plan) {
    return canEdit ? (
      <div className="lifecycle">
        <span className="plan__status">План не заведён</span>
        <button className="btn btn--primary" onClick={onCreate} disabled={busy}>
          Создать план
        </button>
        {onCopy && (
          <button className="btn btn--ghost" onClick={onCopy} disabled={busy}>
            Скопировать прошлый месяц
          </button>
        )}
      </div>
    ) : (
      <div className="lifecycle">
        <span className="plan__status">План не заведён</span>
      </div>
    )
  }

  const status = plan.status === 'approved' ? `Утверждён · версия ${plan.version}` : `Черновик${plan.version > 1 ? ` · версия ${plan.version}` : ''}`

  const approve = async () => {
    if (plan.version > 1 && !reason.trim()) {
      setErr('Укажите причину изменения плана.')
      return
    }
    await onApprove(reason.trim() || null)
    setConfirm(false)
    setReason('')
    setErr(null)
  }

  return (
    <div className="lifecycle">
      <span className={`plan__status ${plan.status === 'approved' ? 'is-approved' : ''}`}>{status}</span>
      {plan.status === 'draft' && canApprove && (
        <button className="btn btn--primary" onClick={() => setConfirm(true)} disabled={busy}>
          Утвердить
        </button>
      )}
      {plan.status === 'approved' && canEdit && (
        <button className="btn btn--ghost" onClick={onNewVersion} disabled={busy}>
          Изменить план
        </button>
      )}
      {bundle.versions?.length > 1 && (
        <span className="lifecycle__history" title={bundle.versions.map((v) => `v${v.version} ${v.status === 'approved' ? 'утв.' : 'черн.'}${v.reason ? ` — ${v.reason}` : ''}`).join('\n')}>
          {bundle.versions.length} верс.
        </span>
      )}

      {confirm && (
        <div className="confirm__backdrop" onClick={() => setConfirm(false)}>
          <div className="confirm" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm__title">Утвердить план?</h3>
            <ul className="plan__summary">
              {summary.map((s) => (
                <li key={s.label}>
                  {s.label}: <b>{fmtValue(s.fmt, s.value)}</b>
                </li>
              ))}
            </ul>
            {gaps.length > 0 && (
              <p className="form-error">
                Нижние планы не сходятся с верхними ({gaps.length}). Утвердить можно, но расхождение останется видно в
                отчётах.
              </p>
            )}
            {plan.version > 1 && (
              <div className="field">
                <label>Причина изменения (обязательно)</label>
                <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            )}
            {err && <p className="form-error">{err}</p>}
            <div className="confirm__actions">
              <button className="btn btn--ghost" onClick={() => setConfirm(false)}>
                Отмена
              </button>
              <button className="btn btn--primary" onClick={approve}>
                Утвердить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// List of reconciliation gaps (see lib/v2/reconcile.js).
export function GapList({ gaps, title = 'Расхождения сверху вниз' }) {
  if (!gaps.length) return <p className="gaps gaps--ok">Нижние планы сходятся с верхними.</p>
  return (
    <div className="gaps">
      <span className="eyebrow">{title}</span>
      <ul>
        {gaps.map((g, i) => (
          <li key={i}>
            <b>{g.label}</b>: сверху {fmtValue(g.kind === 'money' ? 'money' : 'num1', g.top)}, снизу{' '}
            {fmtValue(g.kind === 'money' ? 'money' : 'num1', g.bottom)}{' '}
            <span className="gaps__diff">
              ({g.diff > 0 ? '+' : ''}
              {fmtValue(g.kind === 'money' ? 'money' : 'num1', g.diff)})
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
