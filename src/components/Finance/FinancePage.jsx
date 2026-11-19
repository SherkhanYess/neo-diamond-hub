import { useEffect, useMemo, useState } from 'react'
import { loadFinanceRefs, loadMonthTxs, loadOpening } from '../../lib/api/finance'
import { buildDds } from '../../lib/finance/dds'
import { nextMonth } from '../../lib/finance/opening'
import DdsTable from './DdsTable'
import './Finance.css'

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const monthLabel = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
function prevMonth(m) {
  const [y, mm] = m.split('-').map(Number)
  return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`
}
const thisMonth = () => new Date().toISOString().slice(0, 7)
const FIRST = '2026-08'

// Вкладка «Финансы». Этап 1 — ДДС по фондам; финмодель и план-факт добавятся следующими этапами.
// Учёт общий на компанию: переключатель бренда здесь не действует.
export default function FinancePage() {
  const [month, setMonth] = useState(thisMonth)
  const [refs, setRefs] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadFinanceRefs().then(setRefs).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!refs) return
    let alive = true
    setData(null)
    Promise.all([loadMonthTxs(month), loadOpening(month, refs.config)])
      .then(([txs, opening]) => alive && setData({ txs, opening }))
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [month, refs])

  const dds = useMemo(() => (refs && data ? buildDds({ month, txs: data.txs, R: refs.R, opening: data.opening }) : null), [refs, data, month])

  return (
    <div className="fin">
      <div className="fin__head">
        <div className="fin__month">
          <button onClick={() => setMonth(prevMonth(month))} disabled={month <= FIRST} aria-label="Предыдущий месяц">‹</button>
          <span>{monthLabel(month)}</span>
          <button onClick={() => setMonth(nextMonth(month))} disabled={month >= thisMonth()} aria-label="Следующий месяц">›</button>
        </div>
        <div className="fin__sync">
          Общий учёт компании · Adesk
          {refs?.lastOk && ` · обновлено ${new Date(refs.lastOk).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
          {refs?.lastError && <span className="fin__err"> · ошибка синхронизации: {refs.lastError}</span>}
        </div>
      </div>
      <div className="rep__tabs fin__tabs">
        <button className="is-active">ДДС по фондам</button>
      </div>
      {error && <div className="v2__banner">{error}</div>}
      {!dds && !error && <div className="fin__loading">Загружаю операции Adesk…</div>}
      {dds && <DdsTable dds={dds} refs={refs} />}
    </div>
  )
}
