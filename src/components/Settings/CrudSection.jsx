import { useState, useEffect, useCallback } from 'react'
import DataTable from '../common/DataTable'
import ConfirmDialog from '../common/ConfirmDialog'
import { useToast } from '../common/Toast'
import { useSession } from '../../context/SessionContext'
import { supabase } from '../../lib/supabaseClient'
import { listRef, createRef, updateRef, archiveRef, unarchiveRef, deleteRef, isReferenceInUse } from '../../lib/api/references'
import { validateUniqueName } from '../../lib/referenceRules'
import './CrudSection.css'

export default function CrudSection({ config }) {
  const { profile } = useSession()
  const actorId = profile?.id
  const toast = useToast()

  const [rows, setRows] = useState([])
  const [options, setOptions] = useState({})
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState(null) // row or {} for new
  const [form, setForm] = useState({})
  const [error, setError] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listRef(config.table, { includeArchived: true, select: config.select || '*' })
      setRows(data)
    } finally {
      setLoading(false)
    }
  }, [config.table, config.select])

  useEffect(() => {
    load()
  }, [load])

  // Load option lists for select fields.
  useEffect(() => {
    const need = config.fields.filter((f) => f.optionsFrom).map((f) => f.optionsFrom)
    const unique = [...new Set(need)]
    if (unique.length === 0) return
    Promise.all(
      unique.map(async (table) => {
        if (table === 'profiles') {
          const { data } = await supabase.from('profiles').select('id, full_name').eq('is_active', true)
          return [table, (data ?? []).map((r) => ({ value: r.id, label: r.full_name || '—' }))]
        }
        const data = await listRef(table)
        return [table, data.map((r) => ({ value: r.id, label: r.name }))]
      })
    ).then((pairs) => setOptions(Object.fromEntries(pairs)))
  }, [config.fields])

  const openNew = () => {
    setForm({})
    setError(null)
    setEditing({})
  }
  const openEdit = (row) => {
    setForm({ ...row })
    setError(null)
    setEditing(row)
  }
  const closeForm = () => setEditing(null)

  const save = async () => {
    const nameCheck = validateUniqueName(rows, form.name, editing?.id ?? null)
    if (!nameCheck.valid) {
      setError(nameCheck.error)
      return
    }
    const payload = {}
    for (const f of config.fields) {
      let v = form[f.key]
      const isFk = !!f.optionsFrom // select referencing another table (uuid column)
      const isNum = f.type === 'number'
      if (v === '' || v === undefined) {
        // Empty FK/number → null (avoids '' in uuid/number columns); plain
        // text/enum columns keep '' (some are NOT NULL with a '' default).
        v = isFk || isNum || f.optional ? null : ''
      }
      payload[f.key] = v
    }
    try {
      if (editing.id) {
        await updateRef(config.table, editing.id, payload, actorId)
      } else {
        await createRef(config.table, payload, actorId)
      }
      closeForm()
      await load()
      toast.show({ message: 'Сохранено.' })
    } catch (e) {
      setError('Не удалось сохранить: ' + (e?.message || 'ошибка'))
    }
  }

  const doArchive = async (row) => {
    await archiveRef(config.table, row.id, actorId)
    await load()
    toast.show({
      message: `«${row.name}» в архиве.`,
      actionLabel: 'Отменить',
      onAction: async () => {
        await unarchiveRef(config.table, row.id, actorId)
        await load()
      },
    })
  }

  const doDelete = async (row) => {
    try {
      await deleteRef(config.table, row.id, actorId)
      await load()
      toast.show({ message: `«${row.name}» удалён.` })
    } catch {
      // A reference appeared between the check and the delete (FK violation):
      // fall back to archiving so the action never silently fails.
      await doArchive(row)
    }
  }

  const askRemove = async (row) => {
    let inUse = true
    try {
      inUse = await isReferenceInUse(config.table, row.id)
    } catch {
      inUse = true // on doubt, don't offer a hard delete
    }
    if (!inUse) {
      setConfirm({
        title: `Удалить «${row.name}»?`,
        message: 'Элемент не используется, его можно удалить безвозвратно.',
        confirmLabel: 'Удалить',
        danger: true,
        onConfirm: async () => {
          setConfirm(null)
          await doDelete(row)
        },
      })
    } else {
      setConfirm({
        title: `Архивировать «${row.name}»?`,
        message: 'Элемент уже используется (в сделках, планах или расходах), поэтому его нельзя удалить — только архивировать. Он останется в отчётах прошлых периодов.',
        confirmLabel: 'В архив',
        onConfirm: async () => {
          setConfirm(null)
          await doArchive(row)
        },
      })
    }
  }

  const visible = rows
    .filter((r) => showArchived || !r.is_archived)
    .filter((r) => (r.name || '').toLowerCase().includes(search.toLowerCase()))

  const columns = config.columns.map((c) => ({ ...c }))

  return (
    <div className="crud">
      <div className="crud__toolbar">
        <input
          className="input crud__search"
          placeholder="Поиск…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="crud__archived-toggle">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Показать архив
        </label>
        <button className="btn btn--primary" onClick={openNew}>
          + {config.singular}
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={visible}
          emptyText="Пусто. Добавьте первый элемент."
          actions={(row) => (
            <>
              <button className="crud__link" onClick={() => openEdit(row)}>
                Изменить
              </button>
              {row.is_archived ? (
                <button
                  className="crud__link"
                  onClick={async () => {
                    await unarchiveRef(config.table, row.id, actorId)
                    await load()
                  }}
                >
                  Вернуть
                </button>
              ) : (
                <button className="crud__link crud__link--danger" onClick={() => askRemove(row)}>
                  Удалить
                </button>
              )}
            </>
          )}
        />
      )}

      {editing && (
        <div className="confirm__backdrop" onClick={closeForm}>
          <div className="confirm" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm__title">{editing.id ? 'Изменить' : 'Добавить'}: {config.singular}</h3>
            {config.fields.map((f) => (
              <div className="field" key={f.key}>
                <label>{f.label}</label>
                {f.type === 'select' ? (
                  <select
                    className="select"
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  >
                    <option value="">— не выбрано —</option>
                    {(f.options
                      ? f.options.map((o) => ({ value: o, label: o }))
                      : options[f.optionsFrom] || []
                    ).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    type={f.type === 'number' ? 'number' : 'text'}
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
            {error && <p className="form-error">{error}</p>}
            <div className="confirm__actions">
              <button className="btn btn--ghost" onClick={closeForm}>
                Отмена
              </button>
              <button className="btn btn--primary" onClick={save}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
