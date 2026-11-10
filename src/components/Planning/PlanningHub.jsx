import { useState } from 'react'
import { useSession } from '../../context/SessionContext'
import { can } from '../../lib/permissions'
import { currentMonth } from '../../lib/month'
import PlanningPage from './PlanningPage'
import MarketingPlan from './MarketingPlan'
import SalesPlan from './SalesPlan'
import './PlanningPage.css'

// Планирование сверху вниз: Коммерция → Маркетинг → Отдел продаж.
export default function PlanningHub() {
  const { caps } = useSession()
  const [month, setMonth] = useState(currentMonth())
  const levels = [
    can(caps, ['edit_plan', 'approve_plan']) && { key: 'commerce', label: '1 · Коммерция', hint: 'выручка бренда → задачи → источники, бюджет' },
    can(caps, ['edit_plan', 'approve_plan']) && { key: 'marketing', label: '2 · Маркетинг', hint: 'план источника → конвертеры: бюджет, лиды, квалы' },
    can(caps, ['edit_plan', 'approve_plan', 'sales_all']) && { key: 'sales', label: '3 · Отдел продаж', hint: 'план отдела → подотделы → личные планы' },
  ].filter(Boolean)
  const [level, setLevel] = useState(levels[0]?.key)
  const current = levels.find((l) => l.key === level) || levels[0]

  return (
    <div>
      <div className="plan__levels">
        <div className="plan__level-tabs">
          {levels.map((l) => (
            <button key={l.key} className={current?.key === l.key ? 'is-active' : ''} onClick={() => setLevel(l.key)}>
              {l.label}
            </button>
          ))}
        </div>
        <label className="plan__ctrl">
          <span>Месяц</span>
          <input className="input" type="month" value={month.slice(0, 7)} onChange={(e) => setMonth(e.target.value + '-01')} />
        </label>
      </div>
      {current && <p className="plan__levelhint plan__levelhint--top">{current.hint}</p>}
      {current?.key === 'commerce' && <PlanningPage month={month} setMonth={setMonth} />}
      {current?.key === 'marketing' && <MarketingPlan key={month} month={month} />}
      {current?.key === 'sales' && <SalesPlan key={month} month={month} />}
    </div>
  )
}
