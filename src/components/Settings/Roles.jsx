import { useState, useEffect, useCallback } from 'react'
import { useSession } from '../../context/SessionContext'
import { useToast } from '../common/Toast'
import ConfirmDialog from '../common/ConfirmDialog'
import { CAPS } from '../../lib/permissions'
import { listRoles, createRole, updateRole, deleteRole, listRoleBranches, setRoleBranches } from '../../lib/api/roles'
import { listRef } from '../../lib/api/references'
import './Roles.css'

export default function Roles() {
  const { profile } = useSession()
  const actorId = profile?.id
  const toast = useToast()
  const [roles, setRoles] = useState([])
  const [branches, setBranches] = useState([])
  const [roleBranches, setRoleBranchesState] = useState({})
  const [newName, setNewName] = useState('')
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(async () => {
    const [r, b] = await Promise.all([listRoles(), listRef('branches')])
    setRoles(r)
    setBranches(b)
    const rb = {}
    for (const role of r) {
      if (role.scope_type === 'branches') rb[role.id] = await listRoleBranches(role.id)
    }
    setRoleBranchesState(rb)
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const toggleCap = async (role, cap) => {
    if (role.is_system) return
    const caps = role.caps.includes(cap) ? role.caps.filter((c) => c !== cap) : [...role.caps, cap]
    await updateRole(role.id, { caps }, actorId)
    await load()
  }

  const changeScope = async (role, scope_type) => {
    if (role.is_system) return
    await updateRole(role.id, { scope_type }, actorId)
    await load()
  }

  const toggleBranch = async (role, branchId) => {
    const current = roleBranches[role.id] || []
    const next = current.includes(branchId) ? current.filter((b) => b !== branchId) : [...current, branchId]
    await setRoleBranches(role.id, next, actorId)
    await load()
  }

  const addRole = async () => {
    if (!newName.trim()) return
    await createRole({ name: newName.trim(), caps: [], scope_type: 'all' }, actorId)
    setNewName('')
    await load()
    toast.show({ message: 'Роль создана.' })
  }

  const askDelete = (role) => {
    if (role.is_system) return
    setConfirm({
      title: `Удалить роль «${role.name}»?`,
      onConfirm: async () => {
        setConfirm(null)
        try {
          await deleteRole(role.id, actorId)
          await load()
          toast.show({ message: 'Роль удалена.' })
        } catch {
          toast.show({ message: 'Нельзя удалить роль, назначенную пользователям. Сначала смените им роль.' })
        }
      },
    })
  }

  return (
    <div className="roles">
      <div className="crud__toolbar">
        <input
          className="input crud__search"
          placeholder="Новая роль…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="btn btn--primary" onClick={addRole}>
          + Роль
        </button>
      </div>

      <div className="roles__grid-wrap">
        <table className="roles__grid">
          <thead>
            <tr>
              <th>Роль</th>
              {CAPS.map((c) => (
                <th key={c.key} className="roles__cap">
                  {c.label}
                </th>
              ))}
              <th>Область</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id}>
                <td className="roles__name">
                  {role.name}
                  {role.is_system && <span className="roles__system">системная</span>}
                </td>
                {CAPS.map((c) => (
                  <td key={c.key} className="roles__cap">
                    <input
                      type="checkbox"
                      checked={role.caps.includes(c.key)}
                      disabled={role.is_system}
                      onChange={() => toggleCap(role, c.key)}
                    />
                  </td>
                ))}
                <td>
                  <select
                    className="select roles__scope"
                    value={role.scope_type}
                    disabled={role.is_system}
                    onChange={(e) => changeScope(role, e.target.value)}
                  >
                    <option value="all">Все филиалы</option>
                    <option value="branches">Выбранные</option>
                  </select>
                  {role.scope_type === 'branches' && (
                    <div className="roles__branches">
                      {branches.map((b) => (
                        <label key={b.id}>
                          <input
                            type="checkbox"
                            checked={(roleBranches[role.id] || []).includes(b.id)}
                            onChange={() => toggleBranch(role, b.id)}
                          />
                          {b.name}
                        </label>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  {!role.is_system && (
                    <button className="crud__link crud__link--danger" onClick={() => askDelete(role)}>
                      Удалить
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        confirmLabel="Удалить"
        danger
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
