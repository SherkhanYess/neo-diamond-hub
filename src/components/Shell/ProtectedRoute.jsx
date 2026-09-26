import { Navigate } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'

export default function ProtectedRoute({ children, requireCap }) {
  const { session, caps, loading } = useSession()

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--ink-400)' }}>Загрузка…</div>
  }
  if (!session) {
    return <Navigate to="/login" replace />
  }
  if (requireCap && !caps.includes(requireCap)) {
    return <Navigate to="/" replace />
  }
  return children
}
