import { useState, useEffect, useCallback } from 'react'
import DataTable from '../common/DataTable'
import { useSession } from '../../context/SessionContext'
import { useToast } from '../common/Toast'
import { listProfiles, setActive, updateProfile, listProfileBranches, setProfileBranches, createUser } from '../../lib/api/profiles'
import { listRoles } from '../../lib/api/roles'
import { listRef } from '../../lib/api/references'

const EMPTY_NEW = { email: '', full_name: '', password: '', role_id: '', branch_ids: [] }

export default function Users() {
  const { profile } = useSession()
  const actorId = profile?.id
  const toast = useToast()
  const [profiles, setProfiles] = useState([])
  const [roles, setRoles] = useState([])
  const [branches, setBranches] = useState([])
  const [editing, setEditing] = useState(null)
  const [editBranches, setEditBranches] = useState([])
  const [creating, setCreating] = useState(null) // new-user form state or null
  const [newErr, setNewErr] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [p, r, b] = await Promise.all([listProfiles(), listRoles(), listRef('branches')])
    setProfiles(p)
    setRoles(r)
    setBranches(b)
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const openEdit = async (row) => {
    setEditing(row)
    setEditBranches(await listProfileBranches(row.id))
  }

  const saveEdit = async () => {
    await updateProfile(editing.id, { role_id: editing.role?.id ?? editing.role_id ?? null, full_name: editing.full_name }, actorId)
    await setProfileBranches(editing.id, editBranches, actorId)
    setEditing(null)
    await load()
    toast.show({ message: 'Сохранено.' })
  }

  const toggle = async (row) => {
    await setActive(row.id, !row.is_active, actorId)
    await load()
  }

  const submitNew = async () => {
    setNewErr(null)
    if (!creating.email.trim() || creating.password.length < 8) {
      setNewErr('Укажите email и пароль не короче 8 символов.')
      return
    }
    setBusy(true)
    try {
      await createUser({
        email: creating.email.trim(),
        full_name: creating.full_name.trim(),
        password: creating.password,
        role_id: creating.role_id || null,
        branch_ids: creating.branch_ids,
      })
      setCreating(null)
      await load()
      toast.show({ message: 'Пользователь создан.' })
    } catch (e) {
      setNewErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    { key: 'full_name', label: 'Имя', render: (r) => r.full_name || '—' },
    { key: 'role', label: 'Роль', render: (r) => r.role?.name ?? '—' },
    { key: 'is_active', label: 'Статус', render: (r) => (r.is_active ? 'Активен' : 'Отключён') },
  ]

  return (
    <div className="crud">
      <div className="crud__toolbar">
        <p style={{ color: 'var(--ink-400)', fontSize: 13, margin: 0 }}>
          Создавайте пользователей прямо здесь. Отключённый пользователь не удаляется — его записи сохраняются.
        </p>
        <button className="btn btn--primary" style={{ marginLeft: 'auto' }} onClick={() => { setCreating({ ...EMPTY_NEW }); setNewErr(null) }}>
          + Пользователь
        </button>
      </div>
      <DataTable
        columns={columns}
        rows={profiles}
        emptyText="Пока нет пользователей."
        actions={(row) => (
          <>
            <button className="crud__link" onClick={() => openEdit(row)}>
              Роль/филиалы
            </button>
            <button className="crud__link" onClick={() => toggle(row)}>
              {row.is_active ? 'Отключить' : 'Включить'}
            </button>
          </>
        )}
      />

      {creating && (
        <div className="confirm__backdrop" onClick={() => !busy && setCreating(null)}>
          <div className="confirm" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm__title">Новый пользователь</h3>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={creating.email} onChange={(e) => setCreating((s) => ({ ...s, email: e.target.value }))} />
            </div>
            <div className="field">
              <label>Имя</label>
              <input className="input" value={creating.full_name} onChange={(e) => setCreating((s) => ({ ...s, full_name: e.target.value }))} />
            </div>
            <div className="field">
              <label>Пароль (не короче 8 символов)</label>
              <input className="input" type="text" value={creating.password} onChange={(e) => setCreating((s) => ({ ...s, password: e.target.value }))} />
            </div>
            <div className="field">
              <label>Роль</label>
              <select className="select" value={creating.role_id} onChange={(e) => setCreating((s) => ({ ...s, role_id: e.target.value }))}>
                <option value="">— не выбрано —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Филиалы (пусто = по области роли)</label>
              <div className="roles__branches">
                {branches.map((b) => (
                  <label key={b.id}>
                    <input
                      type="checkbox"
                      checked={creating.branch_ids.includes(b.id)}
                      onChange={() =>
                        setCreating((s) => ({
                          ...s,
                          branch_ids: s.branch_ids.includes(b.id) ? s.branch_ids.filter((x) => x !== b.id) : [...s.branch_ids, b.id],
                        }))
                      }
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            </div>
            {newErr && <p className="form-error">{newErr}</p>}
            <div className="confirm__actions">
              <button className="btn btn--ghost" onClick={() => setCreating(null)} disabled={busy}>Отмена</button>
              <button className="btn btn--primary" onClick={submitNew} disabled={busy}>{busy ? 'Создаём…' : 'Создать'}</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="confirm__backdrop" onClick={() => setEditing(null)}>
          <div className="confirm" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm__title">{editing.full_name || 'Пользователь'}</h3>
            <div className="field">
              <label>Имя</label>
              <input
                className="input"
                value={editing.full_name || ''}
                onChange={(e) => setEditing((s) => ({ ...s, full_name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Роль</label>
              <select
                className="select"
                value={editing.role?.id ?? editing.role_id ?? ''}
                onChange={(e) => setEditing((s) => ({ ...s, role: { id: e.target.value }, role_id: e.target.value }))}
              >
                <option value="">— не выбрано —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Филиалы (пусто = по области роли)</label>
              <div className="roles__branches">
                {branches.map((b) => (
                  <label key={b.id}>
                    <input
                      type="checkbox"
                      checked={editBranches.includes(b.id)}
                      onChange={() =>
                        setEditBranches((s) => (s.includes(b.id) ? s.filter((x) => x !== b.id) : [...s, b.id]))
                      }
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="confirm__actions">
              <button className="btn btn--ghost" onClick={() => setEditing(null)}>
                Отмена
              </button>
              <button className="btn btn--primary" onClick={saveEdit}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
