import { Fragment, useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useV2Data } from '../../lib/v2/useV2Data'
import { sourceCards, converterFunnels, performanceTree } from '../../lib/v2/marketing'
import { monthPace } from '../../lib/v2/metrics'
import { loadAdEntities, loadConverterEntries, loadUtmRules } from '../../lib/v2/loaders'
import { getDisplaySettings } from '../../lib/api/settings'
import KpiCards from '../v2/KpiCards'
import { fmtValue } from '../v2/PlanFactTree'
import TaplinkPage from '../Taplink/TaplinkPage'
import { currentMonth } from '../Reports/FilterBar'
import EmptyState from '../common/EmptyState'
import DecisionModal from '../Decisions/DecisionModal'
import '../v2/v2.css'
import './Marketing.css'

const CONVERTER_COLS = [
  { key: 'entry', label: 'Вход', fmt: 'int', hint: 'Визиты профиля / клики рекламы / сессии сайта' },
  { key: 'cr_entry_lead', label: 'Вход → лид', fmt: 'pct' },
  { key: 'leads', label: 'Лиды', fmt: 'int' },
  { key: 'cr_lead_qual', label: 'Лид → квал', fmt: 'pct' },
  { key: 'quals', label: 'Квалы', fmt: 'int' },
  { key: 'held', label: 'Встречи', fmt: 'int' },
  { key: 'sales', label: 'Продажи', fmt: 'int' },
  { key: 'revenue', label: 'Выручка', fmt: 'money' },
  { key: 'budget', label: 'Вложения', fmt: 'money' },
  { key: 'cpl', label: 'Цена лида', fmt: 'money' },
  { key: 'cpq', label: 'Цена квала', fmt: 'money' },
  { key: 'roas', label: 'ROAS', fmt: 'ratio1' },
  { key: 'ignore_share', label: 'Игнор', fmt: 'pct' },
]

const PERF_COLS = [
  { key: 'spend', label: 'Вложено', fmt: 'money' },
  { key: 'impressions', label: 'Показы', fmt: 'int' },
  { key: 'ctr', label: 'CTR', fmt: 'pct' },
  { key: 'leads', label: 'Лиды', fmt: 'int' },
  { key: 'quals', label: 'Квалы', fmt: 'int' },
  { key: 'cpq', label: 'Цена квала', fmt: 'money' },
  { key: 'held', label: 'Встречи', fmt: 'int' },
  { key: 'sales', label: 'Продажи', fmt: 'int' },
  { key: 'revenue', label: 'Выручка', fmt: 'money' },
  { key: 'roas', label: 'ROAS', fmt: 'ratio1' },
  { key: 'ignore_share', label: 'Игнор', fmt: 'pct' },
]

function Funnelette({ r }) {
  // Mini funnel: share of leads reaching qual / meeting / sale.
  const base = r.leads || 1
  const step = (v) => `${Math.max(2, (v / base) * 100)}%`
  return (
    <div className="funnelette" title={`лиды ${r.leads} → квал ${r.quals} → встреча ${r.held} → продажа ${r.sales}`}>
      <span style={{ width: '100%' }} />
      <span style={{ width: step(r.quals) }} />
      <span style={{ width: step(r.held) }} />
      <span style={{ width: step(r.sales) }} />
    </div>
  )
}

function PerfRows({ nodes, depth, open, toggle }) {
  return nodes.map((n) => {
    const kids = n.children?.length > 0
    const isOpen = open[n.entity.id] ?? depth === 0
    return (
      <Fragment key={n.entity.id}>
        <tr className={`pft__row pft__row--d${depth} ${kids ? 'rep__clickable' : ''}`}>
          <td className="rep__lcol pft__name" style={{ paddingLeft: 12 + depth * 22 }} onClick={() => kids && toggle(n.entity.id, isOpen)}>
            {kids ? <span className="mx__caret">{isOpen ? '▾' : '▸'}</span> : <span className="mx__caret" />}
            {n.entity.name.replace(/^v2demo · /, '')}
            {n.entity.level === 'ad' && n.low_data && <span className="perf__badge">мало данных</span>}
          </td>
          {PERF_COLS.map((c) => (
            <td key={c.key} className={`rep__num mono ${n.entity.level === 'ad' && (c.key === 'roas' || c.key === 'sales' || c.key === 'revenue') ? 'perf__muted' : ''}`}>
              {fmtValue(c.fmt, n[c.key])}
            </td>
          ))}
        </tr>
        {kids && isOpen && <PerfRows nodes={n.children} depth={depth + 1} open={open} toggle={toggle} />}
      </Fragment>
    )
  })
}

// Маркетинг, уровни 2–3 — дашборд источника: конвертеры и Performance.
export default function SourcePage() {
  const { sourceId } = useParams()
  const [params] = useSearchParams()
  const [month, setMonth] = useState(params.get('month') || currentMonth())
  const navigate = useNavigate()
  const d = useV2Data({ month })
  const [entities, setEntities] = useState([])
  const [entries, setEntries] = useState(new Map())
  const [minQuals, setMinQuals] = useState(10)
  const [open, setOpen] = useState({})
  const [showTaplink, setShowTaplink] = useState(false)
  const [deciding, setDeciding] = useState(false)

  const source = d.byId.sources[sourceId]
  const converters = useMemo(
    () => d.dict.converters.filter((c) => c.demand_source_id === sourceId && !c.is_archived),
    [d.dict.converters, sourceId]
  )
  const deals = useMemo(() => d.deals.filter((x) => x.demand_source_id === sourceId), [d.deals, sourceId])
  const brandOfSource = source?.brand_id

  useEffect(() => {
    if (!brandOfSource) return
    loadAdEntities(brandOfSource).then((all) => setEntities(all.filter((e) => e.demand_source_id === sourceId)))
    getDisplaySettings().then((s) => setMinQuals(s?.perf_min_quals ?? 10))
  }, [brandOfSource, sourceId])

  useEffect(() => {
    if (!converters.length) return
    loadUtmRules(brandOfSource).then((rules) => loadConverterEntries(month, converters, d.adStats, rules).then(setEntries))
  }, [month, converters, d.adStats, brandOfSource])

  const card = useMemo(() => {
    if (!source) return null
    const { cards } = sourceCards({
      deals,
      events: d.events,
      plans: d.plans,
      spendBySource: d.spend.bySource,
      spendBrands: d.spendBrands,
      stages: d.stages,
      sources: [source],
    })
    return cards[0]
  }, [source, deals, d.events, d.plans, d.spend, d.spendBrands, d.stages])

  const funnels = useMemo(
    () =>
      converterFunnels({
        deals,
        events: d.events,
        stages: d.stages,
        converters,
        spendByConverter: d.spend.byConverter,
        spendKnown: d.spendBrands.has(brandOfSource),
        entries,
        brandId: brandOfSource,
      }),
    [deals, d.events, d.stages, converters, d.spend, d.spendBrands, entries, brandOfSource]
  )

  const perf = useMemo(() => {
    const ids = new Set(entities.map((e) => e.id))
    return performanceTree({
      entities,
      stats: d.adStats.filter((r) => ids.has(r.ad_entity_id)),
      deals,
      events: d.events,
      stages: d.stages,
      minQuals,
    })
  }, [entities, d.adStats, deals, d.events, d.stages, minQuals])

  if (!d.loading && !source) {
    return <EmptyState title="Источник не найден" description="Возможно, он относится к другому бренду." action={<button className="btn btn--primary" onClick={() => navigate('/marketing')}>К источникам</button>} />
  }
  if (!card) return <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>

  const pace = monthPace(month)
  const kpis = [
    { key: 'budget', label: 'Бюджет', plan: card.planM.budget, fact: card.factM.budget, fmt: 'money', lowerBetter: true, additive: true },
    { key: 'revenue', label: 'Выручка', plan: card.planM.revenue, fact: card.factM.revenue, fmt: 'money', additive: true },
    { key: 'leads', label: 'Лиды', plan: null, fact: card.fact.leads, fmt: 'int' },
    { key: 'quals', label: 'Квал-лиды', plan: null, fact: card.fact.quals, fmt: 'int' },
    { key: 'roas', label: 'ROAS', plan: card.planM.roas, fact: card.factM.roas, fmt: 'ratio1' },
    { key: 'cpq', label: 'Стоимость квала', plan: null, fact: card.factM.cpq, fmt: 'money' },
  ]
  const hasTaplink = converters.some((c) => c.entry_source === 'taplink')
  const toggle = (id, cur) => setOpen((o) => ({ ...o, [id]: !cur }))

  return (
    <div>
      <div className="v2__controls">
        <Link to={`/marketing?month=${month}`} className="crud__link">
          ← Источники
        </Link>
        <h2 className="src__title">{source.name}</h2>
        <label className="v2__ctrl" style={{ marginLeft: 'auto' }}>
          <span>Месяц</span>
          <input className="input" type="month" value={month.slice(0, 7)} onChange={(e) => setMonth(e.target.value + '-01')} />
        </label>
        <button className="btn btn--ghost" onClick={() => setDeciding(true)}>
          + Решение по источнику
        </button>
      </div>

      <KpiCards items={kpis} pace={pace} />

      <h3 className="src__section">Конвертеры</h3>
      {converters.length === 0 ? (
        <p className="v2__note">У источника нет конвертеров — добавьте их в Настройках → Конвертеры.</p>
      ) : (
        <div className="rep__table-wrap">
          <table className="rep__table pft">
            <thead>
              <tr>
                <th className="rep__lcol">Конвертер</th>
                <th>Воронка</th>
                {CONVERTER_COLS.map((c) => (
                  <th key={c.key} title={c.hint || ''}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {funnels.rows.map((r) => (
                <tr key={r.converter.id}>
                  <td className="rep__lcol pft__name">{r.converter.name}</td>
                  <td>
                    <Funnelette r={r} />
                  </td>
                  {CONVERTER_COLS.map((c) => (
                    <td key={c.key} className="rep__num mono">
                      {fmtValue(c.fmt, r[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
              {funnels.orphan && (
                <tr className="perf__noad">
                  <td className="rep__lcol">Без конвертера</td>
                  <td />
                  {CONVERTER_COLS.map((c) => (
                    <td key={c.key} className="rep__num mono">
                      {['leads', 'quals', 'held', 'sales'].includes(c.key) ? fmtValue('int', funnels.orphan[c.key]) : c.key === 'revenue' ? fmtValue('money', funnels.orphan.revenue) : ''}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="v2__note">
        Воронка: лид → квал → встреча → продажа (ширина — доля от лидов). «Вход» — визиты профиля (таплинк), клики
        рекламы или сессии сайта; «н/д», если данных о входе нет.
      </p>

      {hasTaplink && (
        <div className="src__block">
          <button className="btn btn--ghost" onClick={() => setShowTaplink((v) => !v)}>
            {showTaplink ? 'Скрыть' : 'Показать'} вход «Профиль»: таплинк (link.neodiamond.kz)
          </button>
          {showTaplink && (
            <div className="src__embed">
              <TaplinkPage />
            </div>
          )}
        </div>
      )}

      <h3 className="src__section">Performance</h3>
      {perf.campaigns.length === 0 ? (
        <p className="v2__note">
          Рекламных кампаний, привязанных к этому источнику, нет. Привяжите кампании в Настройках → Рекламные кампании.
        </p>
      ) : (
        <div className="rep__table-wrap">
          <table className="rep__table pft">
            <thead>
              <tr>
                <th className="rep__lcol">Кампания / группа / объявление</th>
                {PERF_COLS.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <PerfRows nodes={perf.campaigns} depth={0} open={open} toggle={toggle} />
              {perf.noAd && (
                <tr className="perf__noad">
                  <td className="rep__lcol">Без объявления</td>
                  {PERF_COLS.map((c) => (
                    <td key={c.key} className="rep__num mono">
                      {['leads', 'quals', 'held', 'sales'].includes(c.key) ? fmtValue('int', perf.noAd[c.key]) : c.key === 'revenue' ? fmtValue('money', perf.noAd.revenue) : ''}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="v2__note">
        Бюджет по РК не планируется — им распоряжается performance, здесь только факт. Креативы оцениваются по цене
        квала, доле игнора и квалам; продажи и ROAS на уровне объявления — серым (решения — на уровне кампании и
        группы). Меньше {minQuals} квалов — «мало данных». Аналитика контента и органики появится рядом с Performance.
      </p>

      {deciding && (
        <DecisionModal
          slice={{ brand_id: brandOfSource, demand_source_id: [sourceId], month }}
          sliceLabel={`${d.byId.brands[brandOfSource]?.name ?? ''} · ${source.name}`}
          onClose={() => setDeciding(false)}
        />
      )}
    </div>
  )
}
