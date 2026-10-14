import { Outlet } from 'react-router-dom'
import Logo from '../components/brand/Logo.jsx'
import Icon from '../components/ui/Icon.jsx'
import './AuthLayout.css'

const HIGHLIGHTS = [
  { icon: 'users', text: 'One shared workforce pool for many organizations' },
  { icon: 'sparkles', text: 'AI-assisted allocation within contract rules' },
  { icon: 'activity', text: 'Real-time monitoring of utilization and availability' },
]

/** Split layout for sign-in pages: navy brand panel + form panel. */
function AuthLayout() {
  return (
    <div className="auth-layout">
      <aside className="auth-layout__brand">
        <Logo tone="light" />

        <div className="auth-layout__hero">
          <h1 className="auth-layout__title">
            Your Workforce,
            <br />
            <span>Our Priority</span>
          </h1>
          <p className="auth-layout__subtitle">Manage. Allocate. Grow.</p>

          <ul className="auth-layout__highlights">
            {HIGHLIGHTS.map((item) => (
              <li key={item.text}>
                <span className="auth-layout__highlight-icon">
                  <Icon name={item.icon} size={18} />
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        <svg className="auth-layout__network" viewBox="0 0 320 180" aria-hidden="true">
          <g stroke="#f2b705" strokeOpacity="0.35" strokeWidth="1.5">
            <line x1="40" y1="120" x2="120" y2="60" />
            <line x1="120" y1="60" x2="200" y2="110" />
            <line x1="200" y1="110" x2="280" y2="50" />
            <line x1="120" y1="60" x2="160" y2="150" />
            <line x1="200" y1="110" x2="160" y2="150" />
            <line x1="40" y1="120" x2="160" y2="150" />
          </g>
          <g fill="#f2b705">
            <circle cx="40" cy="120" r="7" />
            <circle cx="120" cy="60" r="10" />
            <circle cx="200" cy="110" r="8" />
            <circle cx="280" cy="50" r="7" />
            <circle cx="160" cy="150" r="6" fillOpacity="0.7" />
          </g>
        </svg>

        <p className="auth-layout__footer">© {new Date().getFullYear()} WorkForceNexus</p>
      </aside>

      <main className="auth-layout__main">
        <div className="auth-layout__mobile-logo">
          <Logo tone="dark" />
        </div>
        <div className="auth-layout__card">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default AuthLayout
