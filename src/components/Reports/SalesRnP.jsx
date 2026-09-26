import { useState, useMemo } from 'react'
import { buckets, funnelSeries, sumOverKeys, monthDays } from '../../lib/reports/timeseries'
import { plannedFunnel } from '../../lib/reports/buildReport'
import { money, num1, pct1 } from '../../lib/format'
import './Reports.css'

// РнП table matching the spreadsheet: fixed План / Ежедневно / Факт / % columns,
// then fact-only day/week columns. Rows interleave stage counts with the
// conversion (CV) between consecutive stages, an overall conversion, and revenue.

function colorClass(plan, fact) {
  if (!plan || fact == null) return ''
  const p = (fact / plan) * 100
  if (p >= 100) return 'rnp__good'
  if (p < 90) return 'rnp__bad'
  return ''
}

export default function SalesRnP({ cohort, plan, orderedStages, filters, thresholds }) {
  const [grouping, setGrouping] = useState('week')
  const [hiddenRows, setHiddenRows] = useState([])
  const [pickOpen, setPickOpen] = useState(false)

  const cols = useMemo(() => buckets(filters.month, grouping), [filters.month, grouping])
  const series = useMemo(() => funnelSeries(cohort.deals, cohort.events), [cohort])
  const planCounts = useMemo(() => plannedFunnel(plan, orderedStages), [plan, orderedStages])
  const days = monthDays(filters.month).length

  const saleStage = orderedStages.find((s) => s.is_sale)
  const obrStage = orderedStages.find((s) => s.sort_order === 1)
  const coreStages = orderedStages.filter((s) => s.sort_order <= (saleStage?.sort_order ?? Infinity))

  // Fact helpers.
  const factMonth = (stageId) => {
    const m = series.byStageDay.get(stageId)
    return m ? [...m.values()].reduce((s, v) => s + v, 0) : 0
  }
  const factBucket = (stageId, keys) => sumOverKeys(series.byStageDay.get(stageId), keys)
  const revMonth = [...series.salesByDay.values()].reduce((s, v) => s + v.revenue, 0)
  const revBucket = (keys) => keys.reduce((s, k) => s + (series.salesByDay.get(k)?.revenue || 0), 0)
  const planRate = (fromId, toId) => {
    const c = (plan?.conversions || []).find((x) => x.from_stage_id === fromId && x.to_stage_id === toId)
    return c ? Number(c.rate) : null
  }

  // Build the ordered row model.
  const rows = []
  coreStages.forEach((s, i) => {
    rows.push({ key: s.id, kind: 'count', label: s.name, stageId: s.id })
    const next = coreStages[i + 1]
    if (next) {
      rows.push({ key: `cv:${s.id}>${next.id}`, kind: 'cv', label: `CV: ${s.name} → ${next.name}`, fromId: s.id, toId: next.id })
    }
  })
  if (obrStage && saleStage) {
    rows.push({ key: 'cv:overall', kind: 'cv', label: 'Общая конверсия', fromId: obrStage.id, toId: saleStage.id, overall: true })
  }
  rows.push({ key: 'revenue', kind: 'revenue', label: 'Сумма продаж' })

  const visibleRows = rows.filter((r) => !hiddenRows.includes(r.key))

  // Cell renderers.
  const fixedCells = (r) => {
    if (r.kind === 'count') {
      const p = planCounts[r.stageId] ?? null
      const f = factMonth(r.stageId)
      return {
        plan: p == null ? '—' : num1(p),
        daily: p == null ? '—' : num1(p / days),
        fact: num1(f),
        pct: p ? pct1((f / p) * 100) : '—',
        factClass: colorClass(p, f),
      }
    }
    if (r.kind === 'revenue') {
      const p = plan?.computed?.grandTotal?.revenue ?? null
      const f = revMonth
      return {
        plan: p == null ? '—' : money(p),
        daily: p == null ? '—' : money(p / days),
        fact: money(f),
        pct: p ? pct1((f / p) * 100) : '—',
        factClass: colorClass(p, f),
      }
    }
    // cv
    const pr = planRate(r.fromId, r.toId)
    const fromF = factMonth(r.fromId)
    const toF = factMonth(r.toId)
    const fr = fromF ? toF / fromF : null
    return {
      plan: pr == null ? '—' : pct1(pr * 100),
      daily: '—',
      fact: fr == null ? '—' : pct1(fr * 100),
      pct: pr && fr != null ? pct1((fr / pr) * 100) : '—',
      factClass: pr != null && fr != null ? colorClass(pr, fr) : '',
    }
  }

  const bucketCell = (r, keys) => {
    if (r.kind === 'count') return num1(factBucket(r.stageId, keys))
    if (r.kind === 'revenue') return money(revBucket(keys))
    const fromF = factBucket(r.fromId, keys)
    const toF = factBucket(r.toId, keys)
    return fromF ? pct1((toF / fromF) * 100) : '—'
  }

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
                    checked={!hiddenRows.includes(r.key)}
                    onChange={() =>
                      setHiddenRows((h) => (h.includes(r.key) ? h.filter((k) => k !== r.key) : [...h, r.key]))
                    }
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
            {visibleRows.map((r) => {
              const fx = fixedCells(r)
              const isCv = r.kind === 'cv'
              return (
                <tr key={r.key} className={isCv ? 'rnp__cv' : ''}>
                  <td className="rep__lcol rnp__name">{r.label}</td>
                  <td className="rnp__fix mono rnp__plan">{fx.plan}</td>
                  <td className="rnp__fix mono rnp__plan">{fx.daily}</td>
                  <td className={`rnp__fix mono ${fx.factClass}`}>{fx.fact}</td>
                  <td className="rnp__fix mono">{fx.pct}</td>
                  {cols.map((c) => (
                    <td key={c.id} className="rep__num mono">
                      {bucketCell(r, c.keys)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="rep__note">
        Слева — план на месяц, ежедневный план, факт и % выполнения. В колонках по {grouping === 'week' ? 'неделям' : 'дням'} —
        только факт (для конверсий — фактическая конверсия периода). «Метрики» скрывают строки.
      </p>
    </div>
  )
}
