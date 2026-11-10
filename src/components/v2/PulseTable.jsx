import { useState, useMemo } from 'react'
import { buckets } from '../../lib/reports/timeseries'
import { periodLength, monthPeriod } from '../../lib/v2/period'
import { pulseTone } from '../../lib/v2/pulse'
import { fmtValue } from './PlanFactTree'
import '../Reports/Reports.css'

const TONE = { good: 'rnp__good', bad: 'rnp__bad', '': '' }

function readHidden(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// Plan-fact by day/week: fixed План / Ежедневно / Факт / % columns, then
// fact-only period columns. Rows come from lib/v2/pulse.js.
export default function PulseTable({ rows, period, month, pace = 1, storageKey, note, basis, onBasis }) {
  const range = period ?? (month ? monthPeriod(month) : null)
  const [grouping, setGrouping] = useState('week')
  const [hidden, setHiddenState] = useState(() => readHidden(storageKey))
  const [pickOpen, setPickOpen] = useState(false)
  const cols = useMemo(() => buckets(range, grouping), [range?.from, range?.to, grouping]) // eslint-disable-line react-hooks/exhaustive-deps
  const days = periodLength(range)

  const setHidden = (fn) =>
    setHiddenState((h) => {
      const next = fn(h)
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })

  const visible = rows.filter((r) => !hidden.includes(r.key))
  const fmt = (r, v) => (v == null ? '—' : fmtValue(r.fmt, v))

  return (
    <div>
      <div className="mx__toolbar">
        <div className="mx__group-toggle">
          <button className={grouping === 'day' ? 'is-active' : ''} onClick={() => setGrouping('day')}>
            По дням
          </button>
          <button className={grouping === 'week' ? 'is-active' : ''} onClick={() => setGrouping('week')}>
            По неделям
          </button>
        </div>
        {onBasis && (
          <div className="mx__group-toggle" title="К какому дню относить квал, встречу и продажу">
            <button className={basis === 'lead' ? 'is-active' : ''} onClick={() => onBasis('lead')}>
              По дате обращения
            </button>
            <button className={basis === 'stage' ? 'is-active' : ''} onClick={() => onBasis('stage')}>
              По дате этапа
            </button>
          </div>
        )}
        <div className="colpick mx__view-btn">
          <button className="btn btn--ghost" onClick={() => setPickOpen((o) => !o)}>
            Метрики
          </button>
          {pickOpen && (
            <div className="colpick__menu" onMouseLeave={() => setPickOpen(false)}>
              {rows.map((r) => (
                <label key={r.key}>
                  <input
                    type="checkbox"
                    checked={!hidden.includes(r.key)}
                    onChange={() => setHidden((h) => (h.includes(r.key) ? h.filter((k) => k !== r.key) : [...h, r.key]))}
                  />
                  {r.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rep__table-wrap">
        <table className="rep__table rnp">
          <thead>
            <tr>
              <th className="rep__lcol rnp__name">Показатель</th>
              <th className="rnp__fix">План</th>
              <th className="rnp__fix">Ежедневно</th>
              <th className="rnp__fix">Факт</th>
              <th className="rnp__fix">% вып.</th>
              {cols.map((c) => (
                <th key={c.id} className="rnp__col">
                  <div>{c.label}</div>
                  <div className="rnp__sub">{c.sub}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const pct = r.plan && r.fact != null ? (r.fact / r.plan) * 100 : null
              return [
                r.section && (
                  <tr key={`s:${r.key}`} className="rnp__section">
                    <td className="rep__lcol rnp__name">{r.section}</td>
                    <td colSpan={4 + cols.length} />
                  </tr>
                ),
                <tr key={r.key} className={r.cv ? 'rnp__cv' : ''}>
                  <td className="rep__lcol rnp__name">{r.label}</td>
                  <td className="rnp__fix mono rnp__plan">{fmt(r, r.plan)}</td>
                  <td className="rnp__fix mono rnp__plan">{r.daily && r.plan != null ? fmtValue(r.fmt, r.plan / days) : '—'}</td>
                  <td className={`rnp__fix mono ${TONE[pulseTone(r, pace)]}`}>{fmt(r, r.fact)}</td>
                  <td className="rnp__fix mono">{pct == null ? '—' : `${Math.round(pct)}%`}</td>
                  {cols.map((c) => (
                    <td key={c.id} className="rep__num mono">
                      {fmt(r, r.bucket(c.keys))}
                    </td>
                  ))}
                </tr>,
              ]
            })}
          </tbody>
        </table>
      </div>
      <p className="rep__note">
        Слева — план на период (месячный план пропорционально дням), план на день, факт и % выполнения; цвет объёмов в текущем периоде — по темпу на сегодня.
        В колонках по {grouping === 'week' ? 'неделям' : 'дням'} — только факт.{' '}
        {onBasis &&
          (basis === 'lead'
            ? 'По дате обращения: квал, встреча и продажа стоят в дне, когда пришёл лид — прошлые дни дорастают, пока ОП дорабатывает лиды. '
            : 'По дате этапа: квал, встреча и продажа стоят в дне, когда их сделали — это работа за день. ')}
        «Метрики» скрывают строки. {note}
      </p>
    </div>
  )
}
