import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../../context/SessionContext'
import { loadFinanceRefs, loadMonthTxs, loadOpening, loadModel, saveModel, loadPlanningRevenue, loadSalesRefs } from '../../lib/api/finance'
import { buildDds } from '../../lib/finance/dds'
import { computeModel, itemPlan } from '../../lib/finance/model'
import { salesOf } from '../../lib/finance/sales'
import { nextMonth } from '../../lib/finance/opening'
import DdsTable from './DdsTable'
import ModelTable from './ModelTable'
import './Finance.css'

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const monthLabel = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
function prevMonth(m) {
  const [y, mm] = m.split('-').map(Number)
  return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`
}
const thisMonth = () => new Date().toISOString().slice(0, 7)
const FIRST = '2026-08'
const TABS = [
  { key: 'model', label: 'Финмодель' },
  { key: 'dds', label: 'ДДС по фондам' },
]
const readTab = () => {
  try {
    return localStorage.getItem('fin.tab') || 'model'
  } catch {
    return 'model'
  }
}

/** Факт прошлого месяца на одну продажу: фонды per_sale и их строки (оплачено ÷ продажи). */
function factPerSale(dds, count) {
  const out = new Map()
  if (!dds || !count) return out
  for (const r of dds.rows) {
    if (!r.fund?.per_sale) continue
    out.set(r.fund.key, r.total / count)
    for (const i of r.items ?? []) out.set(i.key, i.total / count)
  }
  return out
}

// Вкладка «Финансы»: финмодель (план) и ДДС по фондам (факт). Учёт общий на компанию —
// переключатель бренда здесь не действует. План-факт — следующим этапом.
export default function FinancePage() {
  const { profile } = useSession()
  const [tab, setTab] = useState(readTab)
  const [month, setMonth] = useState(thisMonth)
  const [refs, setRefs] = useState(null)
  const [data, setData] = useState(null)
  const [model, setModel] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadFinanceRefs().then(setRefs).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!refs) return
    let alive = true
    setData(null)
    setModel(null)
    const prev = prevMonth(month)
    Promise.all([
      loadMonthTxs(month),
      loadOpening(month, refs.config),
      loadModel(month),
      loadMonthTxs(prev),
      loadSalesRefs(month),
      loadSalesRefs(prev),
      loadPlanningRevenue(month).catch(() => null),
    ])
      .then(([txs, opening, mdl, prevTxs, salesRefs, prevSalesRefs, planning]) => {
        if (!alive) return
        setData({ txs, opening, prevTxs, salesRefs, prevSalesRefs, planning })
        setModel(mdl)
      })
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [month, refs])

  const calc = useMemo(() => {
    if (!refs || !data) return null
    const okladByItem = model ? itemPlan(model) : null
    const dds = buildDds({ month, txs: data.txs, R: refs.R, opening: data.opening, okladByItem })
    const prev = prevMonth(month)
    const prevDds = buildDds({ month: prev, txs: data.prevTxs, R: refs.R, opening: 0, okladByItem })
    const sales = salesOf(month, { projects: data.salesRefs.projects, txs: data.txs, R: refs.R, amo: data.salesRefs.amo })
    const prevSales = salesOf(prev, { projects: data.prevSalesRefs.projects, txs: data.prevTxs, R: refs.R, amo: data.prevSalesRefs.amo })
    return { dds, sales, prevFact: factPerSale(prevDds, prevSales.count), m: model ? computeModel(model, refs.R) : null }
  }, [refs, data, model, month])

  const save = async (patch) => {
    setModel((cur) => ({ ...cur, ...patch }))
    try {
      const saved = await saveModel(month, patch, profile?.id ?? null)
      setModel(saved)
    } catch (e) {
      setError(e.message)
    }
  }

  const choose = (k) => {
    setTab(k)
    try {
      localStorage.setItem('fin.tab', k)
    } catch {
      /* без сохранения вкладки */
    }
  }

  return (
    <div className="fin">
      <div className="fin__head">
        <div className="fin__month">
          <button onClick={() => setMonth(prevMonth(month))} disabled={month <= FIRST} aria-label="Предыдущий месяц">‹</button>
          <span>{monthLabel(month)}</span>
          <button onClick={() => setMonth(nextMonth(month))} disabled={month >= nextMonth(thisMonth())} aria-label="Следующий месяц">›</button>
        </div>
        <div className="fin__sync">
          Общий учёт компании · Adesk
          {refs?.lastOk && ` · обновлено ${new Date(refs.lastOk).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
          {refs?.lastError && <span className="fin__err"> · ошибка синхронизации: {refs.lastError}</span>}
        </div>
      </div>
      <div className="rep__tabs fin__tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'is-active' : ''} onClick={() => choose(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {error && <div className="v2__banner">{error}</div>}
      {!calc && !error && <div className="fin__loading">Загружаю данные Adesk…</div>}
      {calc && tab === 'model' && model && calc.m && (
        <ModelTable
          model={model}
          m={calc.m}
          onSave={save}
          prevFact={calc.prevFact}
          prevLabel={MONTHS_GEN[Number(prevMonth(month).slice(5, 7)) - 1]}
          planning={data.planning}
          sales={calc.sales}
        />
      )}
      {calc && tab === 'model' && !model && <div className="v2__banner">Модели ещё нет.</div>}
      {calc && tab === 'dds' && <DdsTable dds={calc.dds} refs={refs} />}
    </div>
  )
}
