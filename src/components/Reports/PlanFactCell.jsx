import { money, num1, ratio1, pct1 } from '../../lib/format'

const FMT = {
  money,
  num1,
  ratio1,
  int: (v) => Math.round(v).toLocaleString('ru-RU'),
  pct: (v) => pct1(v * 100),
}

// Classify fact vs plan into below / ok / above, honouring metric direction.
function classify(plan, fact, lowerBetter, thresholds) {
  if (!plan || fact == null) return ''
  const p = (fact / plan) * 100
  const good = lowerBetter ? p <= thresholds.high : p >= thresholds.high
  const bad = lowerBetter ? p > 100 + (100 - thresholds.low) : p < thresholds.low
  if (lowerBetter) {
    if (p <= 100) return 'pf--good'
    if (p > thresholds.high) return 'pf--bad'
    return 'pf--ok'
  }
  if (good) return 'pf--good'
  if (bad) return 'pf--bad'
  return 'pf--ok'
}

// One cell showing plan (light blue) beside fact (green/red by performance).
// pace (0..1) = share of the period elapsed: volumes are judged against
// plan × pace mid-month, while the full plan is still what's displayed.
export default function PlanFactCell({ plan, fact, fmt = 'money', lowerBetter = false, thresholds = { low: 90, high: 100 }, pace = 1 }) {
  const f = FMT[fmt] || money
  const cls = classify(plan == null ? null : plan * pace, fact, lowerBetter, thresholds)
  return (
    <div className="pf pf--inline">
      <span className="pf__plan mono">{plan == null ? '—' : f(plan)}</span>
      <span className="pf__sep">/</span>
      <span className={`pf__fact mono ${cls}`}>{fact == null ? 'н/д' : f(fact)}</span>
    </div>
  )
}
