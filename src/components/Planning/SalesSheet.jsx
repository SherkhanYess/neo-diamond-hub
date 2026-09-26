import { computeMarketing, stageCountsBackward } from '../../lib/planning/calc'
import { num1, pct1 } from '../../lib/format'

// Sales sheet: conversion rates between stages (input) + planned deal counts
// per stage (orders rolled backward through conversions).
export default function SalesSheet({ tasks, orderedStages, pairs, onEditConversion, readOnly }) {
  const { grandTotal } = computeMarketing(tasks)
  const ordersAtSale = grandTotal.orders

  const stageIds = orderedStages.map((s) => s.id)
  const conversions = Object.fromEntries(pairs.map((p) => [`${p.from_stage_id}>${p.to_stage_id}`, p.rate]))
  const counts = stageCountsBackward(stageIds, conversions, ordersAtSale)

  return (
    <div className="plan__sheet">
      <p className="plan__hint">
        Заказы (число на этапе «Продажа») — {num1(ordersAtSale)}. Число на каждом
        предыдущем этапе разворачивается назад через конверсии.
      </p>
      <div className="plan__table-wrap">
        <table className="plan__table">
          <thead>
            <tr>
              <th className="plan__sticky-col">Этап</th>
              <th>Плановое число</th>
              <th>Конверсия в следующий, %</th>
            </tr>
          </thead>
          <tbody>
            {orderedStages.map((stage, i) => {
              const pair = pairs.find((p) => p.from_stage_id === stage.id)
              return (
                <tr key={stage.id}>
                  <td className="plan__sticky-col">{stage.name}</td>
                  <td className="plan__num mono">{num1(counts[stage.id])}</td>
                  <td className="plan__num">
                    {pair ? (
                      readOnly ? (
                        <span className="mono">{pct1((pair.rate || 0) * 100)}</span>
                      ) : (
                        <input
                          className="input plan__input"
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={pair.rate}
                          onChange={(e) => onEditConversion(pair.from_stage_id, pair.to_stage_id, e.target.value)}
                        />
                      )
                    ) : (
                      <span className="plan__na">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="plan__hint">Конверсии задаются долей от 0 до 1 (например 0.5 = 50%).</p>
    </div>
  )
}
