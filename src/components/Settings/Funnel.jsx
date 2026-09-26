import { useState, useEffect, useCallback } from 'react'
import DataTable from '../common/DataTable'
import { useToast } from '../common/Toast'
import { useSession } from '../../context/SessionContext'
import { listRef, createRef, updateRef } from '../../lib/api/references'
import { validateFunnelFlags, validateUniqueName } from '../../lib/referenceRules'

// Funnel stages need exactly-one-qualification / exactly-one-sale validation
// and ordering, so they get a bespoke editor rather than the generic CrudSection.
export default function Funnel() {
  const { profile } = useSession()
  const actorId = profile?.id
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [newName, setNewName] = useState('')
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setRows(await listRef('funnel_stages', { includeArchived: true }))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const setFlag = async (row, flag) => {
    // Only one stage may hold each flag: clear it elsewhere first.
    const next = rows.map((r) => ({ ...r, [flag]: r.id === row.id ? !r[flag] : false }))
    const check = validateFunnelFlags(next)
    if (!check.valid) {
      setError(check.errors.join(' '))
      return
    }
    setError(null)
    // Persist: clear flag on all, set on target.
    for (const r of rows) {
      const shouldHave = r.id === row.id ? !row[flag] : false
      if (r[flag] !== shouldHave) {
        await updateRef('funnel_stages', r.id, { [flag]: shouldHave }, actorId)
      }
    }
    await load()
  }

  const move = async (row, dir) => {
    const active = [...rows].sort((a, b) => a.sort_order - b.sort_order)
    const idx = active.findIndex((r) => r.id === row.id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= active.length) return
    const a = active[idx]
    const b = active[swapIdx]
    await updateRef('funnel_stages', a.id, { sort_order: b.sort_order }, actorId)
    await updateRef('funnel_stages', b.id, { sort_order: a.sort_order }, actorId)
    await load()
  }

  const addStage = async () => {
    const check = validateUniqueName(rows, newName)
    if (!check.valid) {
      setError(check.error)
      return
    }
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order), 0)
    await createRef('funnel_stages', { name: newName.trim(), sort_order: maxOrder + 1 }, actorId)
    setNewName('')
    setError(null)
    await load()
    toast.show({ message: 'Этап добавлен.' })
  }

  const ordered = [...rows].sort((a, b) => a.sort_order - b.sort_order)

  const columns = [
    { key: 'order', label: '#', render: (r) => ordered.findIndex((x) => x.id === r.id) + 1 },
    { key: 'name', label: 'Этап' },
    {
      key: 'is_qualification',
      label: 'Квалификация',
      render: (r) => (
        <input type="checkbox" checked={r.is_qualification} onChange={() => setFlag(r, 'is_qualification')} />
      ),
    },
    {
      key: 'is_sale',
      label: 'Продажа',
      render: (r) => <input type="checkbox" checked={r.is_sale} onChange={() => setFlag(r, 'is_sale')} />,
    },
  ]

  return (
    <div className="crud">
      <div className="crud__toolbar">
        <input
          className="input crud__search"
          placeholder="Новый этап…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="btn btn--primary" onClick={addStage}>
          + Этап
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      <DataTable
        columns={columns}
        rows={ordered}
        actions={(row) => (
          <>
            <button className="crud__link" onClick={() => move(row, 'up')}>
              ↑
            </button>
            <button className="crud__link" onClick={() => move(row, 'down')}>
              ↓
            </button>
          </>
        )}
      />
    </div>
  )
}
