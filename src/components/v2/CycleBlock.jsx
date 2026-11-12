import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { loadClosedSales } from '../../lib/v2/loaders'
import { cycleStats, cycleBy } from '../../lib/v2/cycle'
import { UNKNOWN } from '../../lib/v2/metrics'
import './CycleBlock.css'

const fmtDays = (d) => (d == null ? '—' : `${d.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} дн.`)

/** Продажи, закрытые в периоде (+ города филиалов) — для цикла сделки. */
export function useClosedSales(period, { brandId = null, branchId = null } = {}) {
  const [state, setState] = useState({ deals: [], cities: {}, loading: true, error: null })
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    Promise.all([
      loadClosedSales(period, { brandId, branchId }),
      supabase.from('branches').select('id, city_id, cities(name)').then((r) => r.data ?? []),
    ])
      .then(([deals, branches]) => {
        if (!alive) return
        const cities = Object.fromEntries(branches.map((b) => [b.id, { id: b.city_id, name: b.cities?.name ?? '—' }]))
        setState({ deals, cities, loading: false, error: null })
      })
      .catch((e) => alive && setState({ deals: [], cities: {}, loading: false, error: e.message }))
    return () => {
      alive = false
    }
  }, [period.from, period.to, brandId, branchId]) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

/**
 * Блок «Цикл сделки»: общий цикл и разрезы.
 * groups: [{ key, label, col, keyOf(deal), nameOf(id) }]
 */
export default function CycleBlock({ title = 'Цикл сделки', deals, groups, loading, error }) {
  const [tab, setTab] = useState(groups[0]?.key)
  const total = useMemo(() => cycleStats(deals), [deals])
  const group = groups.find((g) => g.key === tab) ?? groups[0]
  const rows = useMemo(() => (group ? cycleBy(deals, group.keyOf) : []), [deals, group])

  return (
    <section className="cycle">
      <div className="cycle__head">
        <h3 className="cycle__title">{title}</h3>
        <div className="cycle__total">
          <span>
            Средний <b className="mono">{fmtDays(total.avg)}</b>
          </span>
          <span>
            Медиана <b className="mono">{fmtDays(total.median)}</b>
          </span>
          <span>
            Продаж <b className="mono">{total.n}</b>
          </span>
        </div>
      </div>
      {groups.length > 1 && (
        <div className="mx__group-toggle cycle__tabs">
          {groups.map((g) => (
            <button key={g.key} className={g.key === group?.key ? 'is-active' : ''} onClick={() => setTab(g.key)}>
              {g.label}
            </button>
          ))}
        </div>
      )}
      {error ? (
        <p className="form-error">Не удалось загрузить продажи: {error}</p>
      ) : loading ? (
        <p className="cycle__empty">Загрузка…</p>
      ) : !rows.length ? (
        <p className="cycle__empty">В периоде нет закрытых продаж.</p>
      ) : (
        <div className="rep__table-wrap">
          <table className="rep__table cycle__table">
            <thead>
              <tr>
                <th className="rep__lcol">{group.col ?? group.label}</th>
                <th>Продаж</th>
                <th>Средний цикл</th>
                <th>Медиана</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="rep__lcol">{r.key === UNKNOWN ? 'Не определено' : group.nameOf(r.key)}</td>
                  <td className="rep__num mono">{r.n}</td>
                  <td className="rep__num mono">{fmtDays(r.avg)}</td>
                  <td className="rep__num mono">{fmtDays(r.median)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="v2__note">
        Цикл — от первой заявки (создание сделки) до продажи. Считается по продажам, закрытым в выбранном периоде:
        у свежих заявок долгие сделки ещё не закрыты, и цикл по заявкам периода вышел бы заниженным. Медиана — типичная
        сделка: половина продаж закрывается быстрее; среднее сильно тянут редкие долгие сделки.
      </p>
    </section>
  )
}
