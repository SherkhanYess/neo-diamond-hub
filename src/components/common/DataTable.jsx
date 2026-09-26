import { useState, useMemo } from 'react'
import './DataTable.css'

// columns: [{ key, label, numeric?, render?(row) }]
export default function DataTable({ columns, rows, rowKey = 'id', actions, emptyText = 'Нет данных' }) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    const col = columns.find((c) => c.key === sortKey)
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = col?.sortValue ? col.sortValue(a) : a[sortKey]
      const bv = col?.sortValue ? col.sortValue(b) : b[sortKey]
      if (av == null) return 1
      if (bv == null) return -1
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return copy
  }, [rows, sortKey, sortDir, columns])

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return (
    <div className="dt__wrap">
      <table className="dt">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={col.numeric ? 'dt__num' : ''}
                onClick={() => toggleSort(col.key)}
              >
                {col.label}
                {sortKey === col.key && <span className="dt__sort">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
              </th>
            ))}
            {actions && <th className="dt__actions-h" />}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td className="dt__empty" colSpan={columns.length + (actions ? 1 : 0)}>
                {emptyText}
              </td>
            </tr>
          )}
          {sorted.map((row) => (
            <tr key={row[rowKey]} className={row.is_archived ? 'dt__archived' : ''}>
              {columns.map((col) => (
                <td key={col.key} className={col.numeric ? 'dt__num mono' : ''}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
              {actions && <td className="dt__actions">{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
