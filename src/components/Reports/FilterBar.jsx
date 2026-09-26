import './FilterBar.css'

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export { currentMonth }

// Shared filter bar. `refs` supplies option lists; `value`/`onChange` manage state.
export default function FilterBar({ refs, value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v || null })

  return (
    <div className="filterbar">
      <label className="filterbar__ctrl">
        <span>Месяц</span>
        <input
          className="input"
          type="month"
          value={(value.month || currentMonth()).slice(0, 7)}
          onChange={(e) => set('month', e.target.value + '-01')}
        />
      </label>
      <label className="filterbar__ctrl">
        <span>Филиал</span>
        <select className="select" value={value.branch_id || ''} onChange={(e) => set('branch_id', e.target.value)}>
          {(refs.branches || []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="filterbar__ctrl">
        <span>Клиентская задача</span>
        <select className="select" value={value.client_task_id || ''} onChange={(e) => set('client_task_id', e.target.value)}>
          <option value="">Все</option>
          {(refs.clientTasks || []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="filterbar__ctrl">
        <span>Источник спроса</span>
        <select className="select" value={value.demand_source_id || ''} onChange={(e) => set('demand_source_id', e.target.value)}>
          <option value="">Все</option>
          {(refs.demandSources || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="filterbar__ctrl">
        <span>Источник лида</span>
        <select className="select" value={value.lead_source_id || ''} onChange={(e) => set('lead_source_id', e.target.value)}>
          <option value="">Все</option>
          {(refs.leadSources || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
