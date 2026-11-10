import { useState, useEffect, useCallback, useMemo } from 'react'
import DataTable from '../common/DataTable'
import ConfirmDialog from '../common/ConfirmDialog'
import { useToast } from '../common/Toast'
import { useSession } from '../../context/SessionContext'
import { useBrand } from '../../context/BrandContext'
import { supabase } from '../../lib/supabaseClient'
import {
  listRef,
  createRef,
  updateRef,
  archiveRef,
  unarchiveRef,
  deleteRef,
  isReferenceInUse,
  BRAND_SCOPED,
} from '../../lib/api/references'
import { validateUniqueName } from '../../lib/referenceRules'
import './CrudSection.css'

// Config-driven dictionary editor.
// config: { table, title, singular, columns, fields, select?, uniqueName?, nameRequired?, rowLabel? }
// field:  { key, label, type: 'text'|'number'|'date'|'select', options?, optionsFrom?,
//           optionsSelect?, optionLabel?(row), optional?, hint? }
export default function CrudSection({ config, onChanged }) {
  const { profile } = useSession()
  const { brandFilter, isAll, brands, brandName } = useBrand()
  const actorId = profile?.id
  const toast = useToast()
  const brandScoped = BRAND_SCOPED.has(config.table)
  const uniqueName = config.uniqueName !== false
  const nameRequired = config.nameRequired !== false
  const rowLabel = config.rowLabel || ((r) => r.name || '—')

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
      const data = await listRef(config.table, {
        includeArchived: true,
        select: config.select || '*',
        brandId: brandScoped ? brandFilter : null,
      })
      setRows(data)
    } finally {
      setLoading(false)
    }
  }, [config.table, config.select, brandScoped, brandFilter])

  useEffect(() => {
    load()
  }, [load])
  // After a change: reload the list and let the owner (e.g. brands) refresh too.
  const reloadAll = useCallback(async () => {
    await load()
    onChanged?.()
  }, [load, onChanged])

  // Option lists for select fields (brand-filtered for brand-owned tables).
  useEffect(() => {
    const fromFields = config.fields.filter((f) => f.optionsFrom)
    if (fromFields.length === 0) return
    Promise.all(
      fromFields.map(async (f) => {
        if (f.optionsFrom === 'profiles') {
          const { data } = await supabase.from('profiles').select('id, full_name').eq('is_active', true)
          return [f.key, (data ?? []).map((r) => ({ value: r.id, label: r.full_name || '—', brand_id: null }))]
        }
        const data = await listRef(f.optionsFrom, {
          select: f.optionsSelect || '*',
          brandId: BRAND_SCOPED.has(f.optionsFrom) ? brandFilter : null,
        })
        const label = f.optionLabel || ((r) => r.name)
        return [f.key, data.map((r) => ({ value: r.id, label: label(r), brand_id: r.brand_id ?? null }))]
      })
    ).then((pairs) => setOptions(Object.fromEntries(pairs)))
  }, [config.fields, brandFilter])

  const fields = useMemo(() => {
    // In «Все бренды» a new brand-owned row needs its brand chosen explicitly.
    if (brandScoped && isAll) {
      return [
        { key: 'brand_id', label: 'Бренд', type: 'select', brandSelect: true },
        ...config.fields,
      ]
    }
    return config.fields
  }, [brandScoped, isAll, config.fields])

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
    const rowBrand = brandScoped ? form.brand_id || brandFilter : null
    if (brandScoped && !rowBrand) {
      setError('Выберите бренд.')
      return
    }
    if (nameRequired || uniqueName) {
      const siblings = brandScoped ? rows.filter((r) => r.brand_id === rowBrand) : rows
      if (uniqueName) {
        const nameCheck = validateUniqueName(siblings, form.name, editing?.id ?? null)
        if (!nameCheck.valid) {
          setError(nameCheck.error)
          return
        }
      } else if (!(form.name || '').trim()) {
        setError('Название не может быть пустым.')
        return
      }
    }
    for (const f of config.fields) {
      if (f.required && (form[f.key] === '' || form[f.key] == null)) {
        setError(`Заполните поле «${f.label}».`)
        return
      }
    }
    const payload = {}
    for (const f of config.fields) {
      let v = form[f.key]
      const isFk = !!f.optionsFrom
      const isNum = f.type === 'number'
      const isDate = f.type === 'date'
      if (v === '' || v === undefined) {
        // Empty → the field default, else null for FK/number/date; NOT NULL text keeps ''.
        v = f.default !== undefined ? f.default : isFk || isNum || isDate || f.optional ? null : ''
      } else if (isNum) {
        v = Number(v)
      }
      payload[f.key] = v
    }
    if (brandScoped) payload.brand_id = rowBrand
    try {
      if (editing.id) {
        await updateRef(config.table, editing.id, payload, actorId)
      } else {
        await createRef(config.table, payload, actorId)
      }
      closeForm()
      await reloadAll()
      toast.show({ message: 'Сохранено.' })
    } catch (e) {
      setError('Не удалось сохранить: ' + (e?.message || 'ошибка'))
    }
  }

  const doArchive = async (row) => {
    await archiveRef(config.table, row.id, actorId)
    await reloadAll()
    toast.show({
      message: `«${rowLabel(row)}» в архиве.`,
      actionLabel: 'Отменить',
      onAction: async () => {
        await unarchiveRef(config.table, row.id, actorId)
        await reloadAll()
      },
    })
  }

  const doDelete = async (row) => {
    try {
      await deleteRef(config.table, row.id, actorId)
      await reloadAll()
      toast.show({ message: `«${rowLabel(row)}» удалён.` })
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
        title: `Удалить «${rowLabel(row)}»?`,
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
        title: `Архивировать «${rowLabel(row)}»?`,
        message:
          'Элемент уже используется (в сделках, планах или расходах), поэтому его нельзя удалить — только архивировать. Он останется в отчётах прошлых периодов.',
        confirmLabel: 'В архив',
        onConfirm: async () => {
          setConfirm(null)
          await doArchive(row)
        },
      })
    }
  }

  const visible = (config.sortRows ? config.sortRows([...rows]) : rows)
    .filter((r) => showArchived || !r.is_archived)
    .filter((r) => rowLabel(r).toLowerCase().includes(search.toLowerCase()))

  const columns = [
    ...(brandScoped && isAll ? [{ key: 'brand_id', label: 'Бренд', render: (r) => brandName(r.brand_id) }] : []),
    ...config.columns,
  ]

  const optionsFor = (f) => {
    if (f.brandSelect) return brands.map((b) => ({ value: b.id, label: b.name }))
    if (f.options) return f.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
    const list = options[f.key] || []
    // When the row's brand is known, offer only that brand's items.
    const rowBrand = form.brand_id || brandFilter
    return rowBrand ? list.filter((o) => !o.brand_id || o.brand_id === rowBrand) : list
  }

  return (
    <div className="crud">
      {config.intro && <p className="crud__intro">{config.intro}</p>}
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
            <h3 className="confirm__title">
              {editing.id ? 'Изменить' : 'Добавить'}: {config.singular}
            </h3>
            {fields.map((f) => (
              <div className="field" key={f.key}>
                <label>{f.label}</label>
                {f.type === 'select' ? (
                  <select
                    className="select"
                    value={form[f.key] ?? ''}
                    disabled={f.brandSelect && !!editing.id}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  >
                    <option value="">— не выбрано —</option>
                    {optionsFor(f).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    value={form[f.key] ?? ''}
                    placeholder={f.placeholder || ''}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  />
                )}
                {f.hint && <span className="crud__hint">{f.hint}</span>}
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
