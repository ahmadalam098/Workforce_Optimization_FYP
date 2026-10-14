import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Logo from '../components/brand/Logo.jsx'
import Avatar from '../components/ui/Avatar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { SystemPrefsProvider } from '../context/SystemPrefsProvider.jsx'
import { useAuth } from '../context/useAuth.js'
import { useSystemPrefs } from '../context/useSystemPrefs.js'
import Spinner from '../components/ui/Spinner.jsx'
import { ADMIN_NAV_SECTIONS } from '../portals/admin/adminNav.js'
import NotificationBell from '../portals/admin/components/NotificationBell.jsx'
import '../portals/admin/admin.css'
import './AdminLayout.css'

function AdminShell() {
  const { user, logout } = useAuth()
  const { ready, version } = useSystemPrefs()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // A new page always starts at the top (after saving an add form the list opens from its first line).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  // The menu starts closed on every screen size and opens only when the menu button is clicked.
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // On computers the menu stays open until the menu button is clicked. On phones it covers the page, so choosing a page closes it.
  function closeOnSmallScreen() {
    if (window.matchMedia('(max-width: 960px)').matches) setSidebarOpen(false)
  }

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={`admin-layout ${sidebarOpen ? 'is-sidebar-open' : ''}`}>
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <div className="admin-sidebar__header">
          <Logo tone="light" compact />
          <button
            type="button"
            className="admin-sidebar__close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <Icon name="close" />
          </button>
        </div>

        <nav className="admin-sidebar__nav">
          {ADMIN_NAV_SECTIONS.map((section) => (
            <div className="admin-nav-section" key={section.title}>
              <p className="admin-nav-section__title">{section.title}</p>
              {section.items.map((item) =>
                item.ready ? (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={closeOnSmallScreen}
                    className={({ isActive }) => `admin-nav-item ${isActive ? 'is-active' : ''}`}
                  >
                    <Icon name={item.icon} size={19} />
                    <span>{item.label}</span>
                  </NavLink>
                ) : (
                  <span key={item.to} className="admin-nav-item is-disabled" aria-disabled="true" title="Coming soon">
                    <Icon name={item.icon} size={19} />
                    <span>{item.label}</span>
                    <span className="admin-nav-item__badge">Soon</span>
                  </span>
                ),
              )}
            </div>
          ))}
        </nav>

        <button type="button" className="admin-nav-item admin-sidebar__logout" onClick={handleLogout}>
          <Icon name="logout" size={19} />
          <span>Logout</span>
        </button>
      </aside>

      <div className="admin-layout__backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />

      <div className="admin-layout__main">
        <header className="admin-topbar">
          <button
            type="button"
            className="admin-topbar__menu"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Toggle menu"
            aria-expanded={sidebarOpen}
          >
            <Icon name="menu" />
          </button>

          <p className="admin-topbar__title">Admin Portal</p>

          <div className="admin-topbar__actions">
            <NotificationBell />
            <div className="admin-topbar__user">
              <Avatar userId={user?.userId} name={user?.fullName} version={user?.pictureVersion} />
              <span className="admin-topbar__user-text">
                <span className="admin-topbar__user-name">{user?.fullName || 'Admin'}</span>
                <span className="admin-topbar__user-role">{user?.roleName}</span>
              </span>
            </div>
          </div>
        </header>

        <main className="admin-layout__content">
          {/* key: pages are shown again after the date or time style is changed in Settings */}
          {ready ? <Outlet key={version} /> : <Spinner label="Loading..." />}
        </main>
      </div>
    </div>
  )
}

/** Navy sidebar + top bar shell for every Admin page. */
function AdminLayout() {
  return (
    <SystemPrefsProvider>
      <AdminShell />
    </SystemPrefsProvider>
  )
}

export default AdminLayout
