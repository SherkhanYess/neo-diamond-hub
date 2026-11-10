import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useV2Data } from '../../lib/v2/useV2Data'
import { sourceCards } from '../../lib/v2/marketing'
import { periodPace } from '../../lib/v2/period'
import { usePeriod } from '../../context/PeriodContext'
import PeriodPicker from '../v2/PeriodPicker'
import { loadAdEntities } from '../../lib/v2/loaders'
import { fmtValue } from '../v2/PlanFactTree'
import EmptyState from '../common/EmptyState'
import '../v2/v2.css'
import './Marketing.css'

function plural(n, [one, few, many]) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

function Stat({ label, plan, fact, fmt, lowerBetter, pace = 1 }) {
  const basis = plan ? plan * pace : null
  const good = basis && fact != null ? (lowerBetter ? fact <= basis : fact >= basis) : null
  return (
    <div className="srccard__stat">
      <span className="srccard__label">{label}</span>
      <span className={`srccard__fact mono ${good === null ? '' : good ? 'is-good' : 'is-bad'}`}>{fmtValue(fmt, fact)}</span>
      {plan != null && plan !== 0 && <span className="srccard__plan mono">план {fmtValue(fmt, plan)}</span>}
    </div>
  )
}

// Маркетинг, уровень 1 — карточки источников спроса бренда.
export default function SourcesPage() {
  const { period } = usePeriod()
  const navigate = useNavigate()
  const d = useV2Data({ period })
  const [unmapped, setUnmapped] = useState({ count: 0, spend: 0 })

  const { cards, unknown } = useMemo(
    () =>
      sourceCards({
        deals: d.deals,
        events: d.events,
        plans: d.plans,
        spendBySource: d.spend.bySource,
        spendBrands: d.spendBrands,
        stages: d.stages,
        sources: d.dict.sources,
      }),
    [d.deals, d.events, d.plans, d.spend, d.spendBrands, d.stages, d.dict.sources]
  )

  // Campaigns not tied to a source that spent money this month: that spend
  // sits outside every card, so it is called out.
  useEffect(() => {
    loadAdEntities(d.brandId).then((ents) => {
      const byId = new Map(ents.map((e) => [e.id, e]))
      const rootOf = (e) => {
        let cur = e
        while (cur?.parent_id && byId.has(cur.parent_id)) cur = byId.get(cur.parent_id)
        return cur
      }
      const spentCampaigns = new Set()
      let spend = 0
      for (const r of d.adStats) {
        const e = byId.get(r.ad_entity_id)
        if (!e || e.demand_source_id || !r.spend) continue
        spend += r.spend
        spentCampaigns.add(rootOf(e)?.id)
      }
      setUnmapped({ count: spentCampaigns.size, spend })
    })
  }, [d.brandId, d.adStats])

  const pace = periodPace(period)

  if (d.isAll) {
    return (
      <EmptyState
        title="Маркетинг смотрится по бренду"
        description="Источники спроса и конвертеры у каждого бренда свои. Выберите бренд в шапке; сводка по всем брендам — в Коммерции."
        action={
          <button className="btn btn--primary" onClick={() => navigate('/commerce')}>
            Открыть Коммерцию
          </button>
        }
      />
    )
  }

  return (
    <div>
      <div className="v2__controls">
        <div className="v2__ctrl">
          <span>Период</span>
          <PeriodPicker />
        </div>
      </div>

      {unmapped.count > 0 && (
        <div className="v2__banner">
          <span>
            Не разнесено: {unmapped.count} {plural(unmapped.count, ['рекламная кампания', 'рекламные кампании', 'рекламных кампаний'])}{' '}
            с расходом {fmtValue('money', unmapped.spend)} не привязаны к источнику — этот расход не попадает ни в одну карточку.
          </span>
          <button className="btn btn--ghost" onClick={() => navigate('/settings')}>
            Настройки → Рекламные кампании
          </button>
        </div>
      )}

      {d.loading ? (
        <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>
      ) : cards.length === 0 ? (
        <EmptyState
          title="Источники спроса не заведены"
          description="Добавьте источники бренда (Instagram, 2ГИС, TikTok…) и их конвертеры в Настройках."
          action={<button className="btn btn--primary" onClick={() => navigate('/settings')}>Открыть Настройки</button>}
        />
      ) : (
        <div className="srcgrid">
          {cards.map((c) => (
            <button
              key={c.source.id}
              className={`srccard ${c.fact.leads || c.fact.budget ? '' : 'srccard--idle'}`}
              onClick={() => navigate(`/marketing/source/${c.source.id}`)}
            >
              <div className="srccard__head">
                <h3>{c.source.name}</h3>
                <span className="srccard__go">→</span>
              </div>
              <div className="srccard__stats">
                <Stat label="Бюджет" plan={c.planM.budget} fact={c.factM.budget} fmt="money" lowerBetter pace={pace} />
                <Stat label="Выручка" plan={c.planM.revenue} fact={c.factM.revenue} fmt="money" pace={pace} />
                <Stat label="Лиды" fact={c.fact.leads} fmt="int" />
                {c.fact.repeats > 0 && <Stat label="Повторные" fact={c.fact.repeats} fmt="int" />}
                <Stat label="Квал-лиды" fact={c.fact.quals} fmt="int" />
                <Stat label="ROAS" plan={c.planM.roas} fact={c.factM.roas} fmt="ratio1" />
                <Stat label="Стоимость квала" fact={c.factM.cpq} fmt="money" />
              </div>
            </button>
          ))}
        </div>
      )}

      {unknown.leads > 0 && (
        <p className="v2__note">
          {unknown.leads} лидов за месяц пришли без распознанного источника (UTM не совпал ни с одним правилом) — они
          учтены в Коммерции строкой «Источник не определён». Правила — в Настройках → UTM-правила.
        </p>
      )}
      <p className="v2__note">
        Источник определяется по UTM с этапа «Обращение»: переход на сайт из 2ГИС относится к 2ГИС, а не к Instagram.
        Факт — по когорте обращений месяца; бюджет — кабинеты по дням + ручной расход.
      </p>
    </div>
  )
}
