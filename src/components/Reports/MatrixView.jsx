import { useState, useMemo, useEffect } from 'react'
import { buildMatrix, groupMatrix, MATRIX_METRICS } from '../../lib/reports/buildReport'
import PlanFactCell from './PlanFactCell'
import './Reports.css'

const LOWER_BETTER = new Set(['budget', 'cac'])
const MODES = [
  { key: 'nested', label: 'Задача × источник' },
  { key: 'task', label: 'По задачам' },
  { key: 'source', label: 'По источникам' },
]

function usePersisted(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(val))
    } catch {
      /* ignore */
    }
  }, [key, val])
  return [val, setVal]
}

export default function MatrixView({ cohort, plan, filters, tasksById, sourcesById, thresholds, onOpenFunnel }) {
  const [mode, setMode] = usePersisted('mx.mode', 'nested')
  const [hidden, setHidden] = usePersisted('mx.hidden', [])
  const [expanded, setExpanded] = useState({})
  const [pickOpen, setPickOpen] = useState(false)

  const { rows } = buildMatrix({ deals: cohort.deals, plan, filters })
  const activeRows = useMemo(() => rows.filter((r) => r.plan_revenue > 0 || r.fact_revenue > 0), [rows])
  const groups = useMemo(() => groupMatrix(activeRows, mode), [activeRows, mode])

  const visibleMetrics = MATRIX_METRICS.filter((m) => !hidden.includes(m.key))

  if (!plan) return null

  const firstColLabel = mode === 'source' ? 'Источник' : mode === 'task' ? 'Задача' : 'Задача / Источник'

  const toggleExpand = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }))
  const toggleMetric = (key) =>
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]))

  const rowLabel = (g) =>
    g.kind === 'source' ? sourcesById[g.demand_source_id]?.name || '—' : tasksById[g.client_task_id]?.name || '—'

  const openFor = (g) => {
    if (g.kind === 'source') onOpenFunnel(null, g.demand_source_id)
    else if (g.kind === 'source-child') onOpenFunnel(g.client_task_id, g.demand_source_id)
    else onOpenFunnel(g.client_task_id, null)
  }

  const cells = (metrics) =>
    visibleMetrics.map((m) => (
      <td key={m.key} className="rep__num">
        <PlanFactCell
          plan={metrics[m.key]?.plan}
          fact={metrics[m.key]?.fact}
          fmt={m.fmt}
          lowerBetter={LOWER_BETTER.has(m.key)}
          thresholds={thresholds}
        />
      </td>
    ))

  return (
    <div>
      <div className="mx__toolbar">
        <div className="mx__group-toggle">
          {MODES.map((mo) => (
            <button key={mo.key} className={mode === mo.key ? 'is-active' : ''} onClick={() => setMode(mo.key)}>
              {mo.label}
            </button>
          ))}
        </div>
        <div className="colpick mx__view-btn">
          <button className="btn btn--ghost" onClick={() => setPickOpen((o) => !o)}>
            Показатели
          </button>
          {pickOpen && (
            <div className="colpick__menu" onMouseLeave={() => setPickOpen(false)}>
              {MATRIX_METRICS.map((m) => (
                <label key={m.key}>
                  <input type="checkbox" checked={!hidden.includes(m.key)} onChange={() => toggleMetric(m.key)} />
                  {m.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rep__table-wrap">
        <table className="rep__table">
          <thead>
            <tr>
              <th className="rep__lcol">{firstColLabel}</th>
              {visibleMetrics.map((m) => (
                <th key={m.key}>{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <FragmentRow
                key={g.id}
                g={g}
                mode={mode}
                expanded={expanded}
                toggleExpand={toggleExpand}
                openFor={openFor}
                rowLabel={rowLabel}
                sourcesById={sourcesById}
                cells={cells}
              />
            ))}
            {groups.length === 0 && (
              <tr>
                <td className="rep__lcol" colSpan={visibleMetrics.length + 1} style={{ color: 'var(--ink-400)' }}>
                  Нет данных за период
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="rep__note">
        Светло-синим — план, зелёным/красным — факт относительно плана. CAC/ROAS и бюджет по факту
        появятся с рекламным расходом. Клик по строке открывает воронку с этим срезом.
      </p>
    </div>
  )
}

function FragmentRow({ g, mode, expanded, toggleExpand, openFor, rowLabel, sourcesById, cells }) {
  const isNestedTask = mode === 'nested' && g.kind === 'task'
  const open = expanded[g.id]
  return (
    <>
      <tr className={g.kind === 'source' || mode !== 'nested' ? 'rep__clickable' : 'mx__task-row'}>
        <td
          className="rep__lcol"
          onClick={() => (isNestedTask ? toggleExpand(g.id) : openFor(g))}
        >
          {isNestedTask && <span className="mx__caret">{open ? '▾' : '▸'}</span>}
          {rowLabel(g)}
        </td>
        {cells(g.metrics)}
      </tr>
      {isNestedTask &&
        open &&
        g.children.map((c) => (
          <tr key={c.id} className="mx__child rep__clickable" onClick={() => openFor(c)}>
            <td className="rep__lcol">{sourcesById[c.demand_source_id]?.name || '—'}</td>
            {cells(c.metrics)}
          </tr>
        ))}
    </>
  )
}
