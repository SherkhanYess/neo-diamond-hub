import { useState } from 'react'
import { DECISION_TYPES, createDecision } from '../../lib/api/decisions'
import { useSession } from '../../context/SessionContext'
import { useToast } from '../common/Toast'

// Create-decision modal. `slice` pre-fills the inherited filters from a report.
export default function DecisionModal({ slice = {}, sliceLabel = '', onClose, onCreated }) {
  const { profile } = useSession()
  const toast = useToast()
  const [form, setForm] = useState({
    decision_type: 'scale',
    hypothesis: '',
    metric_name: '',
    metric_target: '',
    check_date: '',
  })
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }))

  const submit = async () => {
    if (!form.hypothesis.trim()) {
      toast.show({ message: 'Опишите гипотезу.' })
      return
    }
    await createDecision(
      {
        decision_type: form.decision_type,
        slice,
        hypothesis: form.hypothesis.trim(),
        metric_name: form.metric_name.trim(),
        metric_target: form.metric_target === '' ? null : Number(form.metric_target),
        check_date: form.check_date || null,
        owner_id: profile?.id ?? null,
      },
      profile?.id
    )
    toast.show({ message: 'Решение создано.' })
    onCreated?.()
    onClose()
  }

  return (
    <div className="confirm__backdrop" onClick={onClose}>
      <div className="confirm" onClick={(e) => e.stopPropagation()}>
        <h3 className="confirm__title">Новое решение</h3>
        {sliceLabel && <p className="rep__note">Срез: {sliceLabel}</p>}
        <div className="field">
          <label>Решение</label>
          <select className="select" value={form.decision_type} onChange={(e) => set('decision_type', e.target.value)}>
            {DECISION_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Гипотеза — что изменится и почему</label>
          <input className="input" value={form.hypothesis} onChange={(e) => set('hypothesis', e.target.value)} />
        </div>
        <div className="field">
          <label>Показатель</label>
          <input className="input" value={form.metric_name} onChange={(e) => set('metric_name', e.target.value)} placeholder="Напр. CAC, ROAS, заказы" />
        </div>
        <div className="field">
          <label>Целевое значение</label>
          <input className="input" type="number" value={form.metric_target} onChange={(e) => set('metric_target', e.target.value)} />
        </div>
        <div className="field">
          <label>Срок проверки</label>
          <input className="input" type="date" value={form.check_date} onChange={(e) => set('check_date', e.target.value)} />
        </div>
        <div className="confirm__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--primary" onClick={submit}>
            Создать
          </button>
        </div>
      </div>
    </div>
  )
}
