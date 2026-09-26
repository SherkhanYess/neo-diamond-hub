import MultiSelect from './MultiSelect'
import './FilterBar.css'

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export { currentMonth }

// Shared filter bar. Attribute filters are multi-select (arrays); month/branch single.
export default function FilterBar({ refs, value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v })
  const arr = (k) => (Array.isArray(value[k]) ? value[k] : value[k] ? [value[k]] : [])

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
      <div className="filterbar__ctrl">
        <span>Клиентская задача</span>
        <MultiSelect options={refs.clientTasks || []} value={arr('client_task_id')} onChange={(v) => set('client_task_id', v)} />
      </div>
      <div className="filterbar__ctrl">
        <span>Источник спроса</span>
        <MultiSelect options={refs.demandSources || []} value={arr('demand_source_id')} onChange={(v) => set('demand_source_id', v)} />
      </div>
      <div className="filterbar__ctrl">
        <span>Источник лида</span>
        <MultiSelect options={refs.leadSources || []} value={arr('lead_source_id')} onChange={(v) => set('lead_source_id', v)} />
      </div>
    </div>
  )
}
