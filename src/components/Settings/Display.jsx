import { useState, useEffect } from 'react'
import { useSession } from '../../context/SessionContext'
import { useToast } from '../common/Toast'
import { getDisplaySettings, updateDisplaySettings } from '../../lib/api/settings'

export default function Display() {
  const { profile } = useSession()
  const toast = useToast()
  const [form, setForm] = useState(null)

  useEffect(() => {
    getDisplaySettings().then(setForm)
  }, [])

  if (!form) return <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>

  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }))

  const save = async () => {
    await updateDisplaySettings(
      {
        plan_color_low: Number(form.plan_color_low),
        plan_color_high: Number(form.plan_color_high),
        currency: form.currency,
        week_start: Number(form.week_start),
        perf_min_quals: Number(form.perf_min_quals),
      },
      profile?.id
    )
    toast.show({ message: 'Настройки отображения сохранены.' })
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <div className="field">
        <label>Порог «ниже плана», % (меньше — красный)</label>
        <input className="input" type="number" value={form.plan_color_low} onChange={(e) => set('plan_color_low', e.target.value)} />
      </div>
      <div className="field">
        <label>Порог «выше плана», % (больше — зелёный)</label>
        <input className="input" type="number" value={form.plan_color_high} onChange={(e) => set('plan_color_high', e.target.value)} />
      </div>
      <div className="field">
        <label>Валюта</label>
        <input className="input" value={form.currency} onChange={(e) => set('currency', e.target.value)} />
      </div>
      <div className="field">
        <label>Начало недели</label>
        <select className="select" value={form.week_start} onChange={(e) => set('week_start', e.target.value)}>
          <option value={1}>Понедельник</option>
          <option value={0}>Воскресенье</option>
        </select>
      </div>
      <div className="field">
        <label>Порог «мало данных» (мин. квалов в Performance)</label>
        <input className="input" type="number" value={form.perf_min_quals ?? 10} onChange={(e) => set('perf_min_quals', e.target.value)} />
      </div>
      <button className="btn btn--primary" onClick={save}>
        Сохранить
      </button>
    </div>
  )
}
