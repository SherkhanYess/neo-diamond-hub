import { Fragment, useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useV2Data } from '../../lib/v2/useV2Data'
import { sourceCards, converterFunnels, performanceTree, profileVisitsBlock } from '../../lib/v2/marketing'
import { periodPace } from '../../lib/v2/period'
import { usePeriod } from '../../context/PeriodContext'
import PeriodPicker from '../v2/PeriodPicker'
import CycleBlock, { useClosedSales } from '../v2/CycleBlock'
import { loadAdEntities, loadConverterEntries, loadUtmRules } from '../../lib/v2/loaders'
import { getDisplaySettings } from '../../lib/api/settings'
import KpiCards from '../v2/KpiCards'
import { fmtValue } from '../v2/PlanFactTree'
import TaplinkPage from '../Taplink/TaplinkPage'
import EmptyState from '../common/EmptyState'
import DecisionModal from '../Decisions/DecisionModal'
import '../v2/v2.css'
import './Marketing.css'

const CONVERTER_COLS = [
  { key: 'entry', label: 'Клики', fmt: 'int', hint: 'Профиль — переходы в профиль Instagram; реклама — клики по ссылке; сайт — сессии' },
  { key: 'cr_entry_lead', label: 'Клик → заявка', fmt: 'pct' },
  { key: 'profile_visits', label: 'В профиль', fmt: 'int', hint: 'Из рекламы воронки: нажали на аватарку аккаунта вместо кнопки (WhatsApp, «Перейти на сайт»)' },
  { key: 'leads', label: 'Заявки', fmt: 'int', hint: 'Уникальные: первая заявка клиента' },
  { key: 'repeats', label: 'Повторные', fmt: 'int', hint: 'Клиент уже оставлял заявку раньше — не новая заявка, но продажа засчитывается' },
  { key: 'cr_lead_qual', label: 'Заявка → квал', fmt: 'pct' },
  { key: 'quals', label: 'Квалы', fmt: 'int' },
  { key: 'held', label: 'Встречи', fmt: 'int' },
  { key: 'sales', label: 'Продажи', fmt: 'int' },
  { key: 'revenue', label: 'Выручка', fmt: 'money' },
  { key: 'budget', label: 'Вложения', fmt: 'money' },
  { key: 'cpl', label: 'Цена заявки', fmt: 'money' },
  { key: 'cpq', label: 'Цена квала', fmt: 'money' },
  { key: 'roas', label: 'ROAS', fmt: 'ratio1' },
  { key: 'ignore_share', label: 'Игнор', fmt: 'pct' },
]

const PERF_COLS = [
  { key: 'spend', label: 'Вложено', fmt: 'money' },
  { key: 'impressions', label: 'Показы', fmt: 'int' },
  { key: 'cpm', label: 'CPM', fmt: 'money', hint: 'Стоимость 1000 показов' },
  { key: 'clicks', label: 'Клики', fmt: 'int', hint: 'Клики по ссылке объявления — переход в WhatsApp или на сайт' },
  { key: 'ctr', label: 'CTR', fmt: 'pct', hint: 'Клики / показы' },
  { key: 'cpc', label: 'Цена клика', fmt: 'money' },
  { key: 'profile_visits', label: 'В профиль', fmt: 'int', hint: 'Переходы в профиль Instagram из объявления: нажали на аккаунт, а не на кнопку' },
  { key: 'leads', label: 'Заявки', fmt: 'int', hint: 'Уникальные: первая заявка клиента' },
  { key: 'cr_click_lead', label: 'Клик → заявка', fmt: 'pct', hint: 'Сколько кликнувших написали' },
  { key: 'cpl', label: 'Цена заявки', fmt: 'money' },
  { key: 'repeats', label: 'Повторные', fmt: 'int', hint: 'Клиент уже оставлял заявку раньше — не новая заявка, но продажа засчитывается' },
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
    <div className="funnelette" title={`заявки ${r.leads} → квал ${r.quals} → встреча ${r.held} → продажа ${r.sales}`}>
      <span style={{ width: '100%' }} />
      <span style={{ width: step(r.quals) }} />
      <span style={{ width: step(r.held) }} />
      <span style={{ width: step(r.sales) }} />
    </div>
  )
}

function StatusDot({ status }) {
  return <span className={`perf__dot perf__dot--${status.key}`} title={`${status.label}${status.hint && status.hint !== status.label ? ` · ${status.hint}` : ''}`} />
}

function PerfRows({ nodes, depth, open, toggle, showIdle, onCreative }) {
  return nodes
    .filter((n) => showIdle || !n.idle)
    .map((n) => {
      const kids = n.children?.some((k) => showIdle || !k.idle)
      const isOpen = open[n.entity.id] ?? (depth === 0 && n.status.key !== 'off')
      const isAd = n.entity.level === 'ad'
      return (
        <Fragment key={n.entity.id}>
          <tr className={`pft__row pft__row--d${depth} ${kids || isAd ? 'rep__clickable' : ''} ${n.status.key === 'off' ? 'perf__row--off' : ''}`}>
            <td
              className="rep__lcol pft__name"
              style={{ paddingLeft: 12 + depth * 22 }}
              onClick={() => (isAd ? onCreative(n) : kids && toggle(n.entity.id, isOpen))}
            >
              {kids ? <span className="mx__caret">{isOpen ? '▾' : '▸'}</span> : <span className="mx__caret" />}
              <StatusDot status={n.status} />
              {isAd && n.entity.thumbnail_url && <img className="perf__thumb" src={n.entity.thumbnail_url} alt="" loading="lazy" />}
              <span className={isAd ? 'perf__adname' : ''}>{n.entity.name.replace(/^v2demo · /, '')}</span>
              {isAd && n.low_data && <span className="perf__badge">мало данных</span>}
            </td>
            {PERF_COLS.map((c) => (
              <td key={c.key} className={`rep__num mono ${isAd && (c.key === 'roas' || c.key === 'sales' || c.key === 'revenue') ? 'perf__muted' : ''}`}>
                {fmtValue(c.fmt, n[c.key])}
              </td>
            ))}
          </tr>
          {kids && isOpen && <PerfRows nodes={n.children} depth={depth + 1} open={open} toggle={toggle} showIdle={showIdle} onCreative={onCreative} />}
        </Fragment>
      )
    })
}

function ProfileVisits({ block }) {
  const v = (x) => (x == null ? 'н/д' : fmtValue('int', x))
  return (
    <section className="src__block pv">
      <h3 className="src__section">Переходы в профиль</h3>
      <div className="pv__grid">
        <div className="pv__card">
          <span className="pv__label">Всего переходов в профиль</span>
          <b className="pv__value mono">{v(block.total)}</b>
          <span className="pv__sub">статистика Instagram за период</span>
        </div>
        <div className="pv__card">
          <span className="pv__label">Из других воронок</span>
          <b className="pv__value mono">{v(block.fromOthers)}</b>
          <ul className="pv__list">
            {block.others.map((o) => (
              <li key={o.converter.id}>
                <span>{o.converter.name}</span>
                <b className="mono">{o.visits == null ? 'н/д' : fmtValue('int', o.visits)}</b>
              </li>
            ))}
          </ul>
        </div>
        <div className="pv__card">
          <span className="pv__label">Реклама на профиль</span>
          <b className="pv__value mono">{v(block.ownAds)}</b>
          <span className="pv__sub">РК с целью «посещения профиля»</span>
        </div>
        <div className="pv__card">
          <span className="pv__label">Органика</span>
          <b className="pv__value mono">{v(block.organic)}</b>
          <span className="pv__sub">посты, reels, сторис, поиск, рекомендации — без рекламы</span>
        </div>
        <div className="pv__card">
          <span className="pv__label">Заявки с профиля</span>
          <b className="pv__value mono">{v(block.leads)}</b>
          <span className="pv__sub">переход → заявка {block.cr == null ? 'н/д' : fmtValue('pct', block.cr)}</span>
        </div>
      </div>
      <p className="v2__note">
        Переходы из других воронок — из Meta: человек увидел рекламу с кнопкой WhatsApp или «Перейти на сайт», но нажал на
        аватарку аккаунта и попал в профиль. «н/д» — у воронки за период не было рекламы. Органика — всё остальное.
      </p>
    </section>
  )
}

// Instagram-пост объявления можно встроить: /p/<код>/embed показывает сам креатив (видео, карусель).
const igEmbed = (permalink) => {
  const m = String(permalink || '').match(/instagram\.com\/(p|reel|tv)\/([\w-]+)/)
  return m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed` : null
}

function CreativeModal({ node, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const e = node.entity
  const embed = igEmbed(e.permalink)
  return (
    <div className="confirm__backdrop" onClick={onClose}>
      <div className="creative" role="dialog" aria-modal="true" onClick={(ev) => ev.stopPropagation()}>
        <div className="creative__head">
          <div>
            <h3 className="creative__title">{e.name}</h3>
            <span className="creative__status">
              <StatusDot status={node.status} /> {node.status.label}
              {node.status.hint && node.status.hint !== node.status.label ? ` · ${node.status.hint}` : ''}
            </span>
          </div>
          <button className="creative__close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="creative__media">
          {embed ? (
            <iframe title={e.name} src={embed} loading="lazy" allowFullScreen />
          ) : e.thumbnail_url ? (
            <img src={e.thumbnail_url} alt={e.name} />
          ) : (
            <p className="cycle__empty">Превью нет — Meta не отдала креатив (объявление удалено или в архиве).</p>
          )}
        </div>
        <div className="creative__stats">
          {[
            ['Расход', fmtValue('money', node.spend)],
            ['Клики', fmtValue('int', node.clicks)],
            ['В профиль', fmtValue('int', node.profile_visits)],
            ['Заявки', fmtValue('int', node.leads)],
            ['Квалы', fmtValue('int', node.quals)],
            ['Цена квала', fmtValue('money', node.cpq)],
            ['Продажи', fmtValue('int', node.sales)],
          ].map(([k, v]) => (
            <span key={k}>
              {k} <b className="mono">{v}</b>
            </span>
          ))}
        </div>
        <div className="creative__links">
          {e.permalink && (
            <a className="btn btn--ghost" href={e.permalink} target="_blank" rel="noreferrer">
              Открыть в Instagram
            </a>
          )}
          {e.preview_url && (
            <a className="btn btn--ghost" href={e.preview_url} target="_blank" rel="noreferrer">
              Превью рекламы в Facebook
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// Маркетинг, уровни 2–3 — дашборд источника: конвертеры и Performance.
export default function SourcePage() {
  const { sourceId } = useParams()
  const { period } = usePeriod()
  const month = `${period.from.slice(0, 7)}-01`
  const navigate = useNavigate()
  const d = useV2Data({ period })
  const [entities, setEntities] = useState([])
  const [entries, setEntries] = useState(new Map())
  const [minQuals, setMinQuals] = useState(10)
  const [open, setOpen] = useState({})
  const [showTaplink, setShowTaplink] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [showIdle, setShowIdle] = useState(false)
  const [creative, setCreative] = useState(null)

  const source = d.byId.sources[sourceId]
  const converters = useMemo(
    () => d.dict.converters.filter((c) => c.demand_source_id === sourceId && !c.is_archived),
    [d.dict.converters, sourceId]
  )
  const deals = useMemo(() => d.deals.filter((x) => x.demand_source_id === sourceId), [d.deals, sourceId])
  const brandOfSource = source?.brand_id
  const closed = useClosedSales(period, { brandId: d.brandId })
  const closedHere = useMemo(() => closed.deals.filter((x) => x.demand_source_id === sourceId), [closed.deals, sourceId])

  useEffect(() => {
    if (!brandOfSource) return
    loadAdEntities(brandOfSource).then((all) => setEntities(all.filter((e) => e.demand_source_id === sourceId)))
    getDisplaySettings().then((s) => setMinQuals(s?.perf_min_quals ?? 10))
  }, [brandOfSource, sourceId])

  useEffect(() => {
    if (!converters.length) return
    loadUtmRules(brandOfSource).then((rules) => loadConverterEntries(period, converters, d.adStats, rules).then(setEntries))
  }, [period, converters, d.adStats, brandOfSource])

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

  // Переходы в профиль из рекламы (нажали на аватарку, а не на кнопку объявления) —
  // из Meta, по конвертеру объявления: WhatsApp, сайт, гайд, а у «Профиля» — РК на профиль.
  const profileVisits = useMemo(() => {
    const m = new Map()
    for (const r of d.adStats) {
      if (!r.converter_id || !converters.some((c) => c.id === r.converter_id)) continue
      m.set(r.converter_id, (m.get(r.converter_id) || 0) + (r.profile_visits || 0))
    }
    return m
  }, [converters, d.adStats])

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
        profileVisits,
      }),
    [deals, d.events, d.stages, converters, d.spend, d.spendBrands, entries, brandOfSource, profileVisits]
  )
  const profileBlock = useMemo(() => {
    const prof = converters.find((c) => c.entry_source === 'instagram')
    return prof
      ? profileVisitsBlock({ total: entries.get(prof.id) ?? null, rows: funnels.rows, ownAds: profileVisits.get(prof.id) ?? 0 })
      : null
  }, [converters, entries, funnels.rows, profileVisits])

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

  const pace = periodPace(period)
  const kpis = [
    { key: 'budget', label: 'Бюджет', plan: card.planM.budget, fact: card.factM.budget, fmt: 'money', lowerBetter: true, additive: true },
    { key: 'revenue', label: 'Выручка', plan: card.planM.revenue, fact: card.factM.revenue, fmt: 'money', additive: true },
    { key: 'leads', label: 'Заявки', plan: null, fact: card.fact.leads, fmt: 'int' },
    { key: 'repeats', label: 'Повторные заявки', plan: null, fact: card.fact.repeats || 0, fmt: 'int' },
    { key: 'quals', label: 'Квал-лиды', plan: null, fact: card.fact.quals, fmt: 'int' },
    { key: 'roas', label: 'ROAS', plan: card.planM.roas, fact: card.factM.roas, fmt: 'ratio1' },
    { key: 'cpq', label: 'Стоимость квала', plan: null, fact: card.factM.cpq, fmt: 'money' },
  ]
  const hasTaplink =
    converters.some((c) => c.entry_source === 'taplink') ||
    (d.byId.brands[brandOfSource]?.slug === 'neodiamond' && converters.some((c) => c.entry_source === 'instagram'))
  const toggle = (id, cur) => setOpen((o) => ({ ...o, [id]: !cur }))

  return (
    <div>
      <div className="v2__controls">
        <Link to="/marketing" className="crud__link">
          ← Источники
        </Link>
        <h2 className="src__title">{source.name}</h2>
        <div className="v2__ctrl" style={{ marginLeft: 'auto' }}>
          <span>Период</span>
          <PeriodPicker />
        </div>
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
                      {['leads', 'repeats', 'quals', 'held', 'sales'].includes(c.key) ? fmtValue('int', funnels.orphan[c.key]) : c.key === 'revenue' ? fmtValue('money', funnels.orphan.revenue) : ''}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="v2__note">
        Воронка: заявка → квал → встреча → продажа (ширина — доля от заявок). Заявка — первая заявка клиента;
        «Повторные» — клиент уже оставлял заявку раньше: в заявки и конверсии не входит, его продажа и выручка
        засчитываются. «Клики» — у профиля переходы в профиль Instagram, у рекламы клики по ссылке, у сайта сессии;
        «В профиль» — сколько людей из воронки перешли в профиль Instagram вместо её кнопки; «н/д» — данных нет.
      </p>

      {profileBlock && <ProfileVisits block={profileBlock} />}

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

      <div className="perf__head">
        <h3 className="src__section">Performance</h3>
        {perf.campaigns.length > 0 && (
          <div className="perf__legend">
            <span>
              <StatusDot status={{ key: 'active', label: 'Работает' }} /> работает <b className="mono">{perf.campaigns.filter((c) => c.status.key === 'active').length}</b>
            </span>
            <span>
              <StatusDot status={{ key: 'off', label: 'Отключена' }} /> отключена <b className="mono">{perf.campaigns.filter((c) => c.status.key === 'off').length}</b>
            </span>
            {perf.idle > 0 && (
              <button className="crud__link" onClick={() => setShowIdle((v) => !v)}>
                {showIdle ? 'Скрыть отключённые без расходов' : `Показать отключённые без расходов в периоде (${perf.idle})`}
              </button>
            )}
          </div>
        )}
      </div>
      {creative && <CreativeModal node={creative} onClose={() => setCreative(null)} />}
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
                  <th key={c.key} title={c.hint || ''}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <PerfRows nodes={perf.campaigns} depth={0} open={open} toggle={toggle} showIdle={showIdle} onCreative={setCreative} />
              {perf.noAd && (
                <tr className="perf__noad">
                  <td className="rep__lcol">Без объявления</td>
                  {PERF_COLS.map((c) => (
                    <td key={c.key} className="rep__num mono">
                      {['leads', 'repeats', 'quals', 'held', 'sales'].includes(c.key) ? fmtValue('int', perf.noAd[c.key]) : c.key === 'revenue' ? fmtValue('money', perf.noAd.revenue) : ''}
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
        группы). Меньше {minQuals} квалов — «мало данных». Сначала — работающие кампании, внутри — по расходу; статус
        из Meta обновляется раз в час. Нажмите на объявление, чтобы посмотреть креатив.
      </p>

      <CycleBlock
        title="Цикл сделки по конвертерам"
        deals={closedHere}
        loading={closed.loading}
        error={closed.error}
        groups={[
          { key: 'conv', label: 'По конвертерам', col: 'Конвертер', keyOf: (x) => x.converter_id, nameOf: (id) => d.byId.converters[id]?.name ?? '—' },
          { key: 'city', label: 'По городам', col: 'Город', keyOf: (x) => closed.cities[x.branch_id]?.id, nameOf: (id) => Object.values(closed.cities).find((c) => c.id === id)?.name ?? '—' },
        ]}
      />

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
