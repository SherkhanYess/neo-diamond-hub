import { fmtValue } from './PlanFactTree'
import './v2.css'

// Headline numbers: fact large, plan and % of plan below.
// items: [{ key, label, plan, fact, fmt, lowerBetter?, additive?, onClick?, hint? }]
// pace (0..1): for additive volumes mid-month the colour follows plan × pace.
export default function KpiCards({ items, pace = 1 }) {
  return (
    <div className="kpis">
      {items.map((it) => {
        const pct = it.plan && it.fact != null ? (it.fact / it.plan) * 100 : null
        const paced = it.additive && pace > 0 && pace < 1
        const tempo = paced && pct != null ? pct / pace : pct
        const good = tempo == null ? null : it.lowerBetter ? tempo <= 100 : tempo >= 100
        const Tag = it.onClick ? 'button' : 'div'
        return (
          <Tag key={it.key} className="kpi" onClick={it.onClick} title={it.hint || ''}>
            <span className="eyebrow">{it.label}</span>
            <span className="kpi__value">{fmtValue(it.fmt, it.fact)}</span>
            <span className="kpi__plan">
              <span>план {it.plan == null ? '—' : fmtValue(it.fmt, it.plan)}</span>
              {pct != null && (
                <span
                  className={`kpi__pct ${good ? 'kpi__pct--good' : 'kpi__pct--bad'}`}
                  title={paced ? 'Темп: факт относительно плана на сегодняшний день' : '% выполнения плана'}
                >
                  {Math.round(pct)}% плана{paced ? ` · темп ${Math.round(tempo)}%` : ''}
                </span>
              )}
            </span>
          </Tag>
        )
      })}
    </div>
  )
}
