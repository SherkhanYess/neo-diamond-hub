import { usePeriod } from '../../context/PeriodContext'
import { PRESETS, presetPeriod, presetOf, periodLabel } from '../../lib/v2/period'
import './PeriodPicker.css'

// Период отчёта: быстрые кнопки и произвольные даты «с … по …».
export default function PeriodPicker() {
  const { period, setPeriod } = usePeriod()
  const active = presetOf(period)
  return (
    <div className="period" role="group" aria-label="Период">
      <div className="period__presets">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`period__chip ${active === p.key ? 'is-active' : ''}`}
            onClick={() => setPeriod(presetPeriod(p.key))}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="period__range">
        <input
          className="input period__date"
          type="date"
          aria-label="С"
          value={period.from}
          max={period.to}
          onChange={(e) => e.target.value && setPeriod({ ...period, from: e.target.value })}
        />
        <span className="period__dash">—</span>
        <input
          className="input period__date"
          type="date"
          aria-label="По"
          value={period.to}
          min={period.from}
          onChange={(e) => e.target.value && setPeriod({ ...period, to: e.target.value })}
        />
        {!active && <span className="period__label">{periodLabel(period)}</span>}
      </div>
    </div>
  )
}
