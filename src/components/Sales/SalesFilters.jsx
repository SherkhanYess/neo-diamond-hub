import { currentMonth } from '../Reports/FilterBar'
import '../v2/v2.css'

export { currentMonth }

// Отдел продаж filters: brand is a slice here (both brands share the team).
export default function SalesFilters({ value, onChange, brands, branches }) {
  const set = (k, v) => onChange({ ...value, [k]: v })
  return (
    <div className="v2__controls">
      <label className="v2__ctrl">
        <span>Месяц</span>
        <input className="input" type="month" value={value.month.slice(0, 7)} onChange={(e) => set('month', e.target.value + '-01')} />
      </label>
      <label className="v2__ctrl">
        <span>Бренд</span>
        <select className="select" value={value.brandId} onChange={(e) => set('brandId', e.target.value)}>
          <option value="">Все бренды</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="v2__ctrl">
        <span>Филиал</span>
        <select className="select" value={value.branchId} onChange={(e) => set('branchId', e.target.value)}>
          <option value="">Все филиалы</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
