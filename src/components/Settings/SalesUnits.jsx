import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useSession } from '../../context/SessionContext'
import { useToast } from '../common/Toast'
import ConfirmDialog from '../common/ConfirmDialog'
import { logChange } from '../../lib/api/audit'
import { SALES_METRICS, UNIT_KINDS } from '../../lib/v2/sales'

const EMPTY = { name: '', kind: 'lead_center', head_profile_id: '', kpi: [], members: [] }

// Подотделы продаж: состав, руководитель, ЦКП (первая метрика) и метрики экрана.
export default function SalesUnits() {
  const { profile } = useSession()
  const toast = useToast()
  const [units, setUnits] = useState([])
  const [members, setMembers] = useState([])
  const [people, setPeople] = useState([])
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const [{ data: u }, { data: m }, { data: p }] = await Promise.all([
      supabase.from('sales_units').select('*').order('sort_order'),
      supabase.from('sales_unit_members').select('unit_id, profile_id'),
      supabase.from('profiles').select('id, full_name, is_active').order('full_name'),
    ])
    setUnits(u ?? [])
    setMembers(m ?? [])
    setPeople((p ?? []).filter((x) => x.is_active))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const name = (id) => people.find((p) => p.id === id)?.full_name ?? '—'
  const membersOf = (unitId) => members.filter((m) => m.unit_id === unitId).map((m) => m.profile_id)

  const openEdit = (u) => {
    setError(null)
    setEditing(u ? { ...u, head_profile_id: u.head_profile_id || '', members: membersOf(u.id) } : { ...EMPTY })
  }

  const toggleIn = (key, value) =>
    setEditing((e) => ({ ...e, [key]: e[key].includes(value) ? e[key].filter((x) => x !== value) : [...e[key], value] }))

  const moveKpi = (k, dir) =>
    setEditing((e) => {
      const list = [...e.kpi]
      const i = list.indexOf(k)
      const j = i + dir
      if (i < 0 || j < 0 || j >= list.length) return e
      ;[list[i], list[j]] = [list[j], list[i]]
      return { ...e, kpi: list }
    })

  const save = async () => {
    if (!editing.name.trim()) {
      setError('Укажите название подотдела.')
      return
    }
    if (!editing.kpi.length) {
      setError('Выберите хотя бы одну метрику — первая станет ЦКП.')
      return
    }
    const row = {
      name: editing.name.trim(),
      kind: editing.kind,
      head_profile_id: editing.head_profile_id || null,
      kpi: editing.kpi,
    }
    let id = editing.id
    if (id) {
      const { error: e } = await supabase.from('sales_units').update(row).eq('id', id)
      if (e) return setError(e.message)
    } else {
      const { data, error: e } = await supabase.from('sales_units').insert({ ...row, sort_order: units.length + 1 }).select().single()
      if (e) return setError(e.message)
      id = data.id
    }
    await supabase.from('sales_unit_members').delete().eq('unit_id', id)
    if (editing.members.length) {
      await supabase.from('sales_unit_members').insert(editing.members.map((p) => ({ unit_id: id, profile_id: p })))
    }
    await logChange(profile?.id, 'sales_units', id, editing.id ? 'update' : 'create', { ...row, members: editing.members })
    setEditing(null)
    await load()
    toast.show({ message: 'Подотдел сохранён.' })
  }

  const archive = (u) =>
    setConfirm({
      title: `Архивировать «${u.name}»?`,
      message: 'Подотдел пропадёт из отдела продаж; история сделок сохранится.',
      onConfirm: async () => {
        setConfirm(null)
        await supabase.from('sales_units').update({ is_archived: !u.is_archived }).eq('id', u.id)
        await logChange(profile?.id, 'sales_units', u.id, 'archive', { is_archived: !u.is_archived })
        await load()
      },
    })

  return (
    <div className="crud">
      <p className="crud__intro">
        Подотдел = сумма своих сотрудников. Тип задаёт, за что сотруднику засчитывается сделка: лид-центру — этапы до
        «Встреча состоялась», консультациям — новая продажа, аккаунт-менеджерам — повторная. Первая метрика — ЦКП
        подотдела, остальные — колонки экрана сотрудников.
      </p>
      <div className="crud__toolbar">
        <button className="btn btn--primary" style={{ marginLeft: 'auto' }} onClick={() => openEdit(null)}>
          + Подотдел
        </button>
      </div>

      <div className="unitcfg">
        {units.map((u) => (
          <div key={u.id} className={`unitcfg__card ${u.is_archived ? 'is-archived' : ''}`}>
            <div className="unitcfg__head">
              <h3>{u.name}</h3>
              <span className="settings__brand">{UNIT_KINDS[u.kind]}</span>
            </div>
            <p className="unitcfg__line">
              ЦКП: <b>{SALES_METRICS[u.kpi?.[0]]?.label ?? '—'}</b>
            </p>
            <p className="unitcfg__line">Руководитель: {u.head_profile_id ? name(u.head_profile_id) : '—'}</p>
            <p className="unitcfg__line">Сотрудники: {membersOf(u.id).map(name).join(', ') || '—'}</p>
            <div className="unitcfg__actions">
              <button className="crud__link" onClick={() => openEdit(u)}>
                Изменить
              </button>
              <button className="crud__link crud__link--danger" onClick={() => archive(u)}>
                {u.is_archived ? 'Вернуть' : 'В архив'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="confirm__backdrop" onClick={() => setEditing(null)}>
          <div className="confirm confirm--wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm__title">{editing.id ? 'Изменить подотдел' : 'Новый подотдел'}</h3>
            <div className="field">
              <label>Название</label>
              <input className="input" value={editing.name} onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div className="field">
              <label>Тип (за что засчитывается сделка)</label>
              <select className="select" value={editing.kind} onChange={(e) => setEditing((s) => ({ ...s, kind: e.target.value }))}>
                {Object.entries(UNIT_KINDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Руководитель подотдела</label>
              <select className="select" value={editing.head_profile_id} onChange={(e) => setEditing((s) => ({ ...s, head_profile_id: e.target.value }))}>
                <option value="">— не назначен —</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Сотрудники</label>
              <div className="roles__branches unitcfg__checks">
                {people.map((p) => (
                  <label key={p.id}>
                    <input type="checkbox" checked={editing.members.includes(p.id)} onChange={() => toggleIn('members', p.id)} />
                    {p.full_name}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Метрики (первая — ЦКП)</label>
              <div className="unitcfg__kpis">
                {editing.kpi.map((k, i) => (
                  <span key={k} className="unitcfg__kpi">
                    {i === 0 && <b>ЦКП · </b>}
                    {SALES_METRICS[k]?.label}
                    <button onClick={() => moveKpi(k, -1)} title="Выше">↑</button>
                    <button onClick={() => moveKpi(k, 1)} title="Ниже">↓</button>
                    <button onClick={() => toggleIn('kpi', k)} title="Убрать">×</button>
                  </span>
                ))}
              </div>
              <div className="roles__branches unitcfg__checks">
                {Object.entries(SALES_METRICS)
                  .filter(([k]) => !editing.kpi.includes(k))
                  .map(([k, m]) => (
                    <label key={k}>
                      <input type="checkbox" checked={false} onChange={() => toggleIn('kpi', k)} />
                      {m.label}
                    </label>
                  ))}
              </div>
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="confirm__actions">
              <button className="btn btn--ghost" onClick={() => setEditing(null)}>
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
        confirmLabel="Подтвердить"
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
