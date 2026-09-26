import { useState, useEffect, useCallback } from 'react'
import DataTable from '../common/DataTable'
import DecisionModal from './DecisionModal'
import { useSession } from '../../context/SessionContext'
import { useToast } from '../common/Toast'
import { listDecisions, setOutcome, isOverdue, DECISION_TYPES, OUTCOMES } from '../../lib/api/decisions'
import './Decisions.css'

const typeLabel = (k) => DECISION_TYPES.find((t) => t.key === k)?.label || k
const outcomeLabel = (k) => OUTCOMES.find((o) => o.key === k)?.label || '—'

export default function DecisionsPage() {
  const { profile } = useSession()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [creating, setCreating] = useState(false)
  const [resolving, setResolving] = useState(null)
  const [outcome, setOutcomeVal] = useState('worked')
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')
  const [comment, setComment] = useState('')

  const load = useCallback(async () => setRows(await listDecisions()), [])
  useEffect(() => {
    load()
  }, [load])

  const openResolve = (d) => {
    setResolving(d)
    setOutcomeVal('worked')
    setBefore(d.metric_before ?? '')
    setAfter(d.metric_after ?? '')
    setComment(d.outcome_comment ?? '')
  }

  const saveResolve = async () => {
    await setOutcome(
      resolving.id,
      {
        outcome,
        metric_before: before === '' ? null : Number(before),
        metric_after: after === '' ? null : Number(after),
        outcome_comment: comment.trim() || null,
      },
      profile?.id
    )
    setResolving(null)
    await load()
    toast.show({ message: 'Итог сохранён.' })
  }

  const columns = [
    { key: 'decision_type', label: 'Решение', render: (r) => typeLabel(r.decision_type) },
    { key: 'hypothesis', label: 'Гипотеза', render: (r) => r.hypothesis || '—' },
    { key: 'metric', label: 'Показатель', render: (r) => (r.metric_name ? `${r.metric_name}${r.metric_target != null ? ` → ${r.metric_target}` : ''}` : '—') },
    { key: 'owner', label: 'Ответственный', render: (r) => r.owner?.full_name || '—' },
    {
      key: 'check_date',
      label: 'Срок',
      render: (r) => (
        <span className={isOverdue(r) ? 'dec__overdue' : ''}>
          {r.check_date ? new Date(r.check_date).toLocaleDateString('ru-RU') : '—'}
          {isOverdue(r) ? ' • просрочено' : ''}
        </span>
      ),
    },
    { key: 'outcome', label: 'Итог', render: (r) => (r.outcome ? outcomeLabel(r.outcome) : '—') },
  ]

  return (
    <div>
      <div className="crud__toolbar">
        <span className="dec__count">{rows.length} решений</span>
        <button className="btn btn--primary" onClick={() => setCreating(true)} style={{ marginLeft: 'auto' }}>
          + Решение
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey="id"
        emptyText="Решений пока нет. Создавайте их из отчётов или здесь."
        actions={(r) => (
          <button className="crud__link" onClick={() => openResolve(r)}>
            {r.outcome ? 'Итог' : 'Выставить итог'}
          </button>
        )}
      />

      {creating && <DecisionModal slice={{}} onClose={() => setCreating(false)} onCreated={load} />}

      {resolving && (
        <div className="confirm__backdrop" onClick={() => setResolving(null)}>
          <div className="confirm" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm__title">Итог решения</h3>
            <p className="rep__note">{resolving.hypothesis}</p>
            <div className="field">
              <label>Итог</label>
              <select className="select" value={outcome} onChange={(e) => setOutcomeVal(e.target.value)}>
                {OUTCOMES.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Показатель до</label>
              <input className="input" type="number" value={before} onChange={(e) => setBefore(e.target.value)} />
            </div>
            <div className="field">
              <label>Показатель после</label>
              <input className="input" type="number" value={after} onChange={(e) => setAfter(e.target.value)} />
            </div>
            <div className="field">
              <label>Комментарий</label>
              <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
            <div className="confirm__actions">
              <button className="btn btn--ghost" onClick={() => setResolving(null)}>
                Отмена
              </button>
              <button className="btn btn--primary" onClick={saveResolve}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
