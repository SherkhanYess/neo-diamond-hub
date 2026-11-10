import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import BrandSwitcher from './BrandSwitcher'
import { MENU_ITEMS, SETTINGS_ITEM } from '../../lib/permissions'
import './AppShell.css'

const ALL_ITEMS = [...MENU_ITEMS, SETTINGS_ITEM]

function titleForPath(pathname) {
  if (pathname === '/') return 'Рабочий стол'
  const match = ALL_ITEMS.find((i) => i.path !== '/' && pathname.startsWith(i.path))
  return match ? match.label : 'Neo Diamond'
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  const toggle = () => {
    // On mobile the burger opens the overlay; on desktop it collapses.
    if (window.innerWidth <= 768) {
      setMobileOpen((v) => !v)
    } else {
      setCollapsed((v) => !v)
    }
  }

  return (
    <div className="shell">
      {mobileOpen && <div className="shell__scrim" onClick={() => setMobileOpen(false)} />}
      <Sidebar
        collapsed={collapsed}
        onToggle={toggle}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />
      <div className="shell__main">
        <header className="shell__topbar">
          <button className="shell__mobile-burger" onClick={() => setMobileOpen(true)} aria-label="Меню">
            ☰
          </button>
          <h1 className="shell__title">{titleForPath(location.pathname)}</h1>
          {/* Sales is shared by both brands: there brand is a filter, not context. */}
          <div className="shell__filters-slot">{!location.pathname.startsWith('/sales') && <BrandSwitcher />}</div>
        </header>
        <main className="shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
