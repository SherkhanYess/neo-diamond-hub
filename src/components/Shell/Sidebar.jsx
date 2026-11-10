import { NavLink } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { visibleMenuItems, SETTINGS_ITEM, can } from '../../lib/permissions'
import './Sidebar.css'

const ICONS = {
  dashboard: '▤',
  commerce: '◎',
  planning: '◫',
  marketing: '◈',
  sales: '⇅',
  taplink: '◇',
  decisions: '✓',
  reference: '❐',
  settings: '⚙',
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onNavigate }) {
  const { caps, profile, signOut } = useSession()
  const items = visibleMenuItems(caps)
  const showSettings = can(caps, SETTINGS_ITEM.cap)

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${mobileOpen ? 'sidebar--mobile-open' : ''}`}>
      <div className="sidebar__top">
        <button className="sidebar__burger" onClick={onToggle} aria-label="Свернуть меню">
          ☰
        </button>
        {!collapsed && <span className="sidebar__brand">NEO DIAMOND</span>}
      </div>

      <nav className="sidebar__nav">
        {items.map((item) => (
          <NavLink
            key={item.key}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `sidebar__link ${isActive ? 'is-active' : ''}`}
            onClick={onNavigate}
          >
            <span className="sidebar__icon">{ICONS[item.key]}</span>
            {!collapsed && <span className="sidebar__label">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__bottom">
        {showSettings && (
          <NavLink
            to={SETTINGS_ITEM.path}
            className={({ isActive }) => `sidebar__link ${isActive ? 'is-active' : ''}`}
            onClick={onNavigate}
          >
            <span className="sidebar__icon">{ICONS.settings}</span>
            {!collapsed && <span className="sidebar__label">{SETTINGS_ITEM.label}</span>}
          </NavLink>
        )}
        <div className="sidebar__profile">
          {!collapsed && <span className="sidebar__name">{profile?.fullName || 'Профиль'}</span>}
          <button className="sidebar__signout" onClick={signOut} title="Выйти">
            ⏻
          </button>
        </div>
      </div>
    </aside>
  )
}
