import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { can, visibleMenuItems, SETTINGS_ITEM } from '../../lib/permissions'
import EmptyState from '../common/EmptyState'

// requireCap: one cap or a list (any of them). Without access, the user lands
// on the first section their role does allow — never on a redirect loop.
export default function ProtectedRoute({ children, requireCap }) {
  const { session, caps, loading, signOut } = useSession()
  const location = useLocation()

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--ink-400)' }}>Загрузка…</div>
  }
  if (!session) {
    return <Navigate to="/login" replace />
  }
  if (requireCap && !can(caps, requireCap)) {
    const first = [...visibleMenuItems(caps), ...(can(caps, SETTINGS_ITEM.cap) ? [SETTINGS_ITEM] : [])][0]
    if (first && first.path !== location.pathname) return <Navigate to={first.path} replace />
    return (
      <EmptyState
        title="Нет доступа"
        description="У вашей роли пока нет разделов. Обратитесь к владельцу, чтобы он назначил роль."
        action={
          <button className="btn btn--ghost" onClick={signOut}>
            Выйти
          </button>
        }
      />
    )
  }
  return children
}
