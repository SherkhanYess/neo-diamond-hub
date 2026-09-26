import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import FilterBar, { currentMonth } from './FilterBar'
import TaskBar from './TaskBar'
import { useReportData } from '../../lib/reports/useReportData'
import { loadAdEntities, flatAds } from '../../lib/api/performance'
import { getDisplaySettings } from '../../lib/api/settings'
import { qualifiedDealIds, adMetrics, withoutAd } from '../../lib/reports/performance'
import { buckets, funnelSeries, sumOverKeys } from '../../lib/reports/timeseries'
import { money, num1, pct1 } from '../../lib/format'
import './Reports.css'

const na = (v, render) => (v == null ? <span className="rep__na">н/д</span> : render(v))

export default function PerformancePage() {
  const [filters, setFilters] = useState({ month: currentMonth(), branch_id: null })
  const [view, setView] = useState('table')
  const [grouping, setGrouping] = useState('day')
  const [ads, setAds] = useState([])
  const [minQuals, setMinQuals] = useState(10)
  const { refs, orderedStages, cohort, loading } = useReportData(filters)

  useEffect(() => {
    if (!filters.branch_id && refs.branches.length) setFilters((f) => ({ ...f, branch_id: refs.branches[0].id }))
  }, [refs.branches, filters.branch_id])

  const loadPerf = useCallback(async () => {
    const [entities, disp] = await Promise.all([loadAdEntities(), getDisplaySettings()])
    setAds(entities)
    setMinQuals(disp?.perf_min_quals ?? 10)
  }, [])
  useEffect(() => {
    loadPerf()
  }, [loadPerf])

  const qualStage = orderedStages.find((s) => s.is_qualification)
  const perfSource = refs.demandSources.find((s) => s.name === 'Performance')
  const tasksById = useMemo(() => Object.fromEntries(refs.clientTasks.map((t) => [t.id, t])), [refs.clientTasks])

  const metrics = useMemo(() => {
    if (!qualStage) return []
    const qualIds = qualifiedDealIds(cohort.events, qualStage.id)
    return adMetrics(flatAds(ads), cohort.deals, qualIds, minQuals)
  }, [ads, cohort, qualStage, minQuals])

  const obrStage = orderedStages.find((s) => s.sort_order === 1)
  const dynamics = useMemo(() => {
    if (!qualStage || !obrStage) return { cols: [], obr: null, qual: null }
    const cols = buckets(filters.month, grouping)
    const { byStageDay } = funnelSeries(cohort.deals, cohort.events)
    return { cols, obr: byStageDay.get(obrStage.id), qual: byStageDay.get(qualStage.id) }
  }, [cohort, qualStage, obrStage, filters.month, grouping])

  const noAd = useMemo(() => {
    if (!qualStage || !perfSource) return null
    const qualIds = qualifiedDealIds(cohort.events, qualStage.id)
    return withoutAd(cohort.deals, perfSource.id, qualIds)
  }, [cohort, qualStage, perfSource])

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Link to="/marketing" className="crud__link">← Маркетинг</Link>
      </div>
      <FilterBar refs={refs} value={filters} onChange={setFilters} />

      <div className="rep__tabs">
        <button className={view === 'table' ? 'is-active' : ''} onClick={() => setView('table')}>
          Таблица
        </button>
        <button className={view === 'gallery' ? 'is-active' : ''} onClick={() => setView('gallery')}>
          Галерея креативов
        </button>
        <button className={view === 'dynamics' ? 'is-active' : ''} onClick={() => setView('dynamics')}>
          Динамика (дни/недели)
        </button>
      </div>

      {loading && <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>}

      {!loading && view === 'table' && (
        <div className="rep__table-wrap">
          <table className="rep__table">
            <thead>
              <tr>
                <th className="rep__lcol">Объявление</th>
                <th>Расход</th>
                <th>Показы</th>
                <th>CTR</th>
                <th>Обращения</th>
                <th>Квалы</th>
                <th>Стоим. квала</th>
                <th>Доля игнора</th>
                <th>Задачи (квалы)</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.ad_id} className={m.low_data ? 'perf__low' : ''}>
                  <td className="rep__lcol">
                    {m.name}
                    {m.low_data && <span className="perf__badge">мало данных</span>}
                  </td>
                  <td className="rep__num mono">{money(m.spend)}</td>
                  <td className="rep__num mono">{num1(m.impressions)}</td>
                  <td className="rep__num mono">{m.impressions ? pct1((m.clicks / m.impressions) * 100) : '—'}</td>
                  <td className="rep__num mono">{m.leads}</td>
                  <td className="rep__num mono">{m.quals}</td>
                  <td className="rep__num mono">{na(m.cost_per_qual, (v) => money(v))}</td>
                  <td className="rep__num mono">{na(m.ignore_rate, (v) => pct1(v * 100))}</td>
                  <td><TaskBar breakdown={m.task_breakdown} tasksById={tasksById} /></td>
                </tr>
              ))}
              {noAd && (noAd.leads > 0) && (
                <tr className="perf__noad">
                  <td className="rep__lcol">Без объявления</td>
                  <td className="rep__num rep__na">н/д</td>
                  <td className="rep__num rep__na">н/д</td>
                  <td className="rep__num rep__na">н/д</td>
                  <td className="rep__num mono">{noAd.leads}</td>
                  <td className="rep__num mono">{noAd.quals}</td>
                  <td className="rep__num rep__na">н/д</td>
                  <td className="rep__num rep__na">н/д</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
          <p className="rep__note">
            Все CRM-метрики считаются по когорте обращений периода. Строки с числом квалов ниже
            {' '}{minQuals} помечены «мало данных». «Без объявления» — сделки Performance без ID
            объявления; их доля должна стремиться к нулю.
          </p>
        </div>
      )}

      {!loading && view === 'gallery' && (
        <div className="perf__gallery">
          {metrics.map((m) => (
            <div key={m.ad_id} className={`perf__card ${m.low_data ? 'perf__low' : ''}`}>
              <div className="perf__preview">{m.name}</div>
              <div className="perf__card-body">
                <div className="perf__card-line">
                  <span>Стоимость квала</span>
                  <b className="mono">{m.cost_per_qual == null ? 'н/д' : money(m.cost_per_qual)}</b>
                </div>
                <div className="perf__card-line">
                  <span>Доля игнора</span>
                  <b className="mono">{m.ignore_rate == null ? 'н/д' : pct1(m.ignore_rate * 100)}</b>
                </div>
                <div className="perf__card-line">
                  <span>Квалы</span>
                  <b className="mono">{m.quals}</b>
                </div>
                <TaskBar breakdown={m.task_breakdown} tasksById={tasksById} />
                {m.low_data && <span className="perf__badge">мало данных</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && view === 'dynamics' && (
        <div>
          <div className="mx__group-toggle" style={{ marginBottom: 12 }}>
            <button className={grouping === 'day' ? 'is-active' : ''} onClick={() => setGrouping('day')}>
              По дням
            </button>
            <button className={grouping === 'week' ? 'is-active' : ''} onClick={() => setGrouping('week')}>
              По неделям
            </button>
          </div>
          <div className="rep__table-wrap">
            <table className="rep__table rnp">
              <thead>
                <tr>
                  <th className="rep__lcol">Показатель</th>
                  {dynamics.cols.map((c) => (
                    <th key={c.id} className="rnp__col">
                      <div>{c.label}</div>
                      <div className="rnp__sub">{c.sub}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="rep__lcol">Обращения</td>
                  {dynamics.cols.map((c) => (
                    <td key={c.id} className="rep__num mono">{num1(sumOverKeys(dynamics.obr, c.keys))}</td>
                  ))}
                </tr>
                <tr>
                  <td className="rep__lcol">Квалы</td>
                  {dynamics.cols.map((c) => (
                    <td key={c.id} className="rep__num mono">{num1(sumOverKeys(dynamics.qual, c.keys))}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="rep__note">Динамика обращений и квалификаций по {grouping === 'week' ? 'неделям' : 'дням'} месяца.</p>
        </div>
      )}
    </div>
  )
}
