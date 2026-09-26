import { useState, useEffect, useCallback } from 'react'
import DataTable from '../common/DataTable'
import { useSession } from '../../context/SessionContext'
import { useToast } from '../common/Toast'
import { listProfiles, setActive, updateProfile, listProfileBranches, setProfileBranches } from '../../lib/api/profiles'
import { listRoles } from '../../lib/api/roles'
import { listRef } from '../../lib/api/references'

export default function Users() {
  const { profile } = useSession()
  const actorId = profile?.id
  const toast = useToast()
  const [profiles, setProfiles] = useState([])
  const [roles, setRoles] = useState([])
  const [branches, setBranches] = useState([])
  const [editing, setEditing] = useState(null)
  const [editBranches, setEditBranches] = useState([])

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

  const columns = [
    { key: 'full_name', label: 'Имя', render: (r) => r.full_name || '—' },
    { key: 'role', label: 'Роль', render: (r) => r.role?.name ?? '—' },
    { key: 'is_active', label: 'Статус', render: (r) => (r.is_active ? 'Активен' : 'Отключён') },
  ]

  return (
    <div className="crud">
      <p style={{ color: 'var(--ink-400)', fontSize: 13, marginTop: 0 }}>
        Новые пользователи заводятся через приглашение в Supabase Auth; здесь им назначается роль и филиалы.
        Отключённый пользователь не удаляется — его записи в журналах сохраняются.
      </p>
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
