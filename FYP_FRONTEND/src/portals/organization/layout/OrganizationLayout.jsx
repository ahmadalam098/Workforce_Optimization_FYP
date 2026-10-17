import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import ErrorBoundary from '../../../components/ErrorBoundary.jsx'
import CallProvider from '../../../components/calls/CallProvider.jsx'
import Logo from '../../../components/brand/Logo.jsx'
import Avatar from '../../../components/ui/Avatar.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import { useAuth } from '../../../context/useAuth.js'
import { organizationNotificationsApi } from '../../../services/organization/organizationService.js'
import NotificationBell from '../../admin/notifications/NotificationBell.jsx'
import { organizationEntityLink } from '../organizationNotifications.js'
import { ORGANIZATION_NAV_SECTIONS } from '../organizationNav.js'
import '../../admin/admin.css'
import '../../admin/layout/AdminLayout.css'

/** Navy sidebar + top bar shell for every Organization page (same look as the other portals). */
function OrganizationLayoutShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  function closeOnSmallScreen() {
    if (window.matchMedia('(max-width: 960px)').matches) setSidebarOpen(false)
  }

  async function handleLogout() {
    await logout()
    navigate('/organization/login', { replace: true })
  }

  return (
    <div className={`admin-layout ${sidebarOpen ? 'is-sidebar-open' : ''}`}>
      <aside className="admin-sidebar" aria-label="Organization navigation">
        <div className="admin-sidebar__header">
          <Logo tone="light" compact />
          <button type="button" className="admin-sidebar__close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>

        <nav className="admin-sidebar__nav">
          {ORGANIZATION_NAV_SECTIONS.map((section) => (
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

          <p className="admin-topbar__title">Organization Portal</p>

          <div className="admin-topbar__actions">
            <NotificationBell api={organizationNotificationsApi} linkFor={organizationEntityLink} footerTo={null} />
            <div className="admin-topbar__user">
              {/* an organization has no user id, so the avatar shows the initials of its name */}
              <Avatar userId={null} name={user?.fullName} />
              <span className="admin-topbar__user-text">
                <span className="admin-topbar__user-name">{user?.fullName || 'Organization'}</span>
                <span className="admin-topbar__user-role">{user?.roleName}</span>
              </span>
            </div>
          </div>
        </header>

        <main className="admin-layout__content">
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

/** The portal shell, with the calls (incoming call, call screen, who is online) available on every page. */
function OrganizationLayout() {
  return (
    <CallProvider>
      <OrganizationLayoutShell />
    </CallProvider>
  )
}

export default OrganizationLayout
