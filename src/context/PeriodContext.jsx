import { createContext, useContext, useState, useCallback } from 'react'
import { normalize, presetPeriod } from '../lib/v2/period'

// Выбранный период отчётов — один на всё приложение (Рабочий стол, Коммерция,
// Маркетинг, Отдел продаж): переход между вкладками его не сбрасывает.
// Планирование остаётся помесячным и этот период не использует.
const STORAGE_KEY = 'hub.period'
const PeriodContext = createContext(null)

function readStored() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    return v?.from && v?.to ? normalize(v) : presetPeriod('thisMonth')
  } catch {
    return presetPeriod('thisMonth')
  }
}

export function PeriodProvider({ children }) {
  const [period, setState] = useState(readStored)
  const setPeriod = useCallback((p) => {
    const next = normalize(p)
    setState(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* private mode — keep in memory only */
    }
  }, [])
  return <PeriodContext.Provider value={{ period, setPeriod }}>{children}</PeriodContext.Provider>
}

export function usePeriod() {
  const ctx = useContext(PeriodContext)
  if (!ctx) throw new Error('usePeriod must be used within PeriodProvider')
  return ctx
}
