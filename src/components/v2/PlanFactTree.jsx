import { Fragment, useState, useEffect } from 'react'
import PlanFactCell from '../Reports/PlanFactCell'
import { money, num1, ratio1, pct1 } from '../../lib/format'
import '../Reports/Reports.css'
import './v2.css'

// Expandable plan/fact tree. nodes: [{ key, id, level, planM, factM, children }]
// metrics: [{ key, label, fmt, lowerBetter?, planless? }]
// label(node) → string; onRowClick(node) optional; storageKey persists hidden columns.
export default function PlanFactTree({ nodes, metrics, label, firstColLabel, onRowClick, canOpen, storageKey, thresholds, pace = 1 }) {
  const openable = (n) => !!onRowClick && (canOpen ? canOpen(n) : true)
  const [hidden, setHidden] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '[]')
    } catch {
      return []
    }
  })
  const [open, setOpen] = useState({})
  const [pick, setPick] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(hidden))
    } catch {
      /* ignore */
    }
  }, [storageKey, hidden])

  const cols = metrics.filter((m) => !hidden.includes(m.key))
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }))
  const nonEmpty = (n) => n.fact.leads || n.fact.revenue || n.fact.budget || n.plan.revenue || n.plan.budget || n.plan.sales

  const renderRows = (list, depth) =>
    list.filter(nonEmpty).map((n) => {
      const hasKids = n.children && n.children.some(nonEmpty)
      const isOpen = open[n.key] ?? depth === 0
      return (
        <Fragment key={n.key}>
          <tr className={`pft__row pft__row--d${depth} ${openable(n) || hasKids ? 'rep__clickable' : ''}`}>
            <td
              className="rep__lcol pft__name"
              style={{ paddingLeft: 12 + depth * 22 }}
              onClick={() => (hasKids ? toggle(n.key) : openable(n) && onRowClick(n))}
            >
              {hasKids ? <span className="mx__caret">{isOpen ? '▾' : '▸'}</span> : <span className="mx__caret" />}
              {label(n)}
              {openable(n) && hasKids && (
                <button
                  className="pft__go"
                  title="Открыть"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRowClick(n)
                  }}
                >
                  →
                </button>
              )}
            </td>
            {cols.map((m) => (
              <td key={m.key} className="rep__num">
                {m.planless ? (
                  <span className="mono">{fmtValue(m.fmt, n.factM[m.key])}</span>
                ) : (
                  <PlanFactCell
                    plan={n.planM[m.key]}
                    fact={n.factM[m.key]}
                    fmt={m.fmt}
                    lowerBetter={m.lowerBetter}
                    thresholds={thresholds}
                    pace={m.additive ? pace : 1}
                  />
                )}
              </td>
            ))}
          </tr>
          {hasKids && isOpen && renderRows(n.children, depth + 1)}
        </Fragment>
      )
    })

  return (
    <div>
      <div className="mx__toolbar">
        <span className="pft__legend">
          <span className="pf__plan mono">план</span> / <span className="pf__fact pf--good mono">факт</span>
        </span>
        <div className="colpick mx__view-btn">
          <button className="btn btn--ghost" onClick={() => setPick((p) => !p)}>
            Показатели
          </button>
          {pick && (
            <div className="colpick__menu" onMouseLeave={() => setPick(false)}>
              {metrics.map((m) => (
                <label key={m.key}>
                  <input
                    type="checkbox"
                    checked={!hidden.includes(m.key)}
                    onChange={() => setHidden((h) => (h.includes(m.key) ? h.filter((x) => x !== m.key) : [...h, m.key]))}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="rep__table-wrap">
        <table className="rep__table pft">
          <thead>
            <tr>
              <th className="rep__lcol">{firstColLabel}</th>
              {cols.map((m) => (
                <th key={m.key} title={m.hint || ''}>
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {renderRows(nodes, 0)}
            {!nodes.some(nonEmpty) && (
              <tr>
                <td className="rep__lcol" colSpan={cols.length + 1} style={{ color: 'var(--ink-400)' }}>
                  Нет данных за период
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function fmtValue(fmt, v) {
  if (v == null) return 'н/д'
  if (fmt === 'money') return money(v)
  if (fmt === 'ratio1') return ratio1(v)
  if (fmt === 'pct') return pct1(v * 100)
  if (fmt === 'int') return Math.round(v).toLocaleString('ru-RU')
  return num1(v)
}
