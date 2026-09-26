import { money, num1, pct1 } from '../../lib/format'

// Brandbook palette: fact = ink-800, plan = ink-200 (ghost), accent = champagne-700.

// Horizontal funnel: fact bars scaled to the largest stage; plan shown as a tick.
export function FunnelChart({ rows }) {
  const maxVal = Math.max(1, ...rows.map((r) => Math.max(r.fact ?? 0, r.plan ?? 0)))
  return (
    <div className="chart__funnel">
      {rows.map((r) => {
        const factW = r.fact == null ? 0 : (r.fact / maxVal) * 100
        const planW = r.plan == null ? 0 : (r.plan / maxVal) * 100
        return (
          <div className="chart__funnel-row" key={r.stage_id}>
            <span className="chart__funnel-label">{r.name}</span>
            <div className="chart__funnel-track">
              {r.plan != null && <span className="chart__funnel-plan" style={{ left: `${planW}%` }} />}
              <span className="chart__funnel-bar" style={{ width: `${factW}%` }} />
            </div>
            <span className="chart__funnel-val mono">{r.fact == null ? 'н/д' : num1(r.fact)}</span>
          </div>
        )
      })}
    </div>
  )
}

// Grouped horizontal bars: plan vs fact per category.
export function BarCompare({ items, format = money }) {
  const maxVal = Math.max(1, ...items.flatMap((i) => [i.plan || 0, i.fact || 0]))
  return (
    <div className="chart__bars">
      {items.map((it) => (
        <div className="chart__bars-row" key={it.key}>
          <span className="chart__bars-label">{it.label}</span>
          <div className="chart__bars-group">
            <div className="chart__bar-track">
              <span className="chart__bar chart__bar--fact" style={{ width: `${((it.fact || 0) / maxVal) * 100}%` }} />
            </div>
            <div className="chart__bar-track">
              <span className="chart__bar chart__bar--plan" style={{ width: `${((it.plan || 0) / maxVal) * 100}%` }} />
            </div>
          </div>
          <span className="chart__bars-val mono">{format(it.fact || 0)}</span>
        </div>
      ))}
      <div className="chart__legend">
        <span><i className="chart__dot chart__dot--fact" /> факт</span>
        <span><i className="chart__dot chart__dot--plan" /> план</span>
      </div>
    </div>
  )
}

// Circular progress for plan execution.
export function ProgressRing({ pct, label }) {
  const clamped = Math.max(0, Math.min(150, pct)) // cap ring at 150%
  const r = 52
  const c = 2 * Math.PI * r
  const filled = (Math.min(clamped, 100) / 100) * c
  const over = clamped > 100
  return (
    <div className="chart__ring">
      <svg viewBox="0 0 130 130" width="130" height="130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="var(--paper-200)" strokeWidth="12" />
        <circle
          cx="65"
          cy="65"
          r={r}
          fill="none"
          stroke={over ? 'var(--champagne-700)' : 'var(--ink-800)'}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          transform="rotate(-90 65 65)"
        />
        <text x="65" y="62" textAnchor="middle" className="chart__ring-num">
          {pct1(pct)}
        </text>
        <text x="65" y="82" textAnchor="middle" className="chart__ring-label">
          {label}
        </text>
      </svg>
    </div>
  )
}
