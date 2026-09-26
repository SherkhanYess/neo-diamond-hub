import { money, num1, ratio1 } from '../../lib/format'

const FMT = { money, num1, ratio1 }

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

// One cell showing plan (light blue) over fact (green/red by performance).
export default function PlanFactCell({ plan, fact, fmt = 'money', lowerBetter = false, thresholds = { low: 90, high: 100 } }) {
  const f = FMT[fmt] || money
  const cls = classify(plan, fact, lowerBetter, thresholds)
  return (
    <div className="pf">
      <span className="pf__plan mono">{plan == null ? '—' : f(plan)}</span>
      <span className={`pf__fact mono ${cls}`}>{fact == null ? 'н/д' : f(fact)}</span>
    </div>
  )
}
