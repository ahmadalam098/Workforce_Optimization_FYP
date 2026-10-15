import { Link } from 'react-router-dom'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useAuth } from '../../../context/useAuth.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { managerApi } from '../../../services/manager/managerService.js'
import { formatNumber, formatTimeAgo, humanize } from '../../../utils/format.js'
import { greeting, STATUS_COLORS } from '../../admin/dashboard/dashboardUtils.js'
import StatCard from '../../admin/shared/StatCard.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import '../../admin/dashboard/AdminDashboardPage.css'

/** First page of the Organization Manager portal. Same layout, colours and fonts as the Admin dashboard, but only about the manager's own organizations. */
function ManagerDashboardPage() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useFetch((signal) => managerApi.dashboard(signal), 'manager-dashboard')

  if (!data && loading) return <Spinner label="Loading dashboard..." />
  if (!data) {
    return (
      <div className="card">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  const firstName = (data.fullName || user?.fullName || 'Manager').split(' ')[0]
  const availabilityTotal = data.availability.reduce((sum, item) => sum + item.count, 0)
  const maxOrgCount = Math.max(1, ...data.employeesByOrganization.map((item) => item.count))

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div className="dashboard-hero__text">
          <p className="dashboard-hero__eyebrow">{greeting()}</p>
          <h2 className="dashboard-hero__title">Welcome back, {firstName}</h2>
          <p className="dashboard-hero__summary">
            <strong>{formatNumber(data.employeesWorking)}</strong> {data.employeesWorking === 1 ? 'employee works' : 'employees work'} for your{' '}
            {data.organizations === 1 ? 'organization' : `${formatNumber(data.organizations)} organizations`}, and{' '}
            <strong>{formatNumber(data.freeEmployees)}</strong> {data.freeEmployees === 1 ? 'employee is' : 'employees are'} free in the pool.
          </p>
          <div className="dashboard-hero__actions">
            <Link to="/manager/employee-pool" className="hero-btn hero-btn--dark">
              <Icon name="users" size={17} /> Open employee pool
            </Link>
          </div>
        </div>

        <div className="dashboard-hero__panel" aria-label="Availability overview">
          <p className="dashboard-hero__panel-title">Your workforce availability</p>
          {availabilityTotal === 0 ? (
            <p className="dashboard-hero__panel-empty">No employees are working for your organizations yet.</p>
          ) : (
            <>
              <div className="segment-bar" role="img" aria-label="Your employees by availability status">
                {data.availability.map((item) => (
                  <span
                    key={item.status}
                    className="segment-bar__part"
                    style={{ flexGrow: item.count, background: STATUS_COLORS[item.status] || '#a79f90' }}
                    title={`${humanize(item.status)}: ${item.count}`}
                  />
                ))}
              </div>
              <ul className="legend">
                {data.availability.map((item) => (
                  <li key={item.status}>
                    <span className="legend__dot" style={{ background: STATUS_COLORS[item.status] || '#a79f90' }} aria-hidden="true" />
                    <span>{humanize(item.status)}</span>
                    <strong>{item.count}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      <section className="stat-grid" aria-label="Key metrics">
        <StatCard label="My organizations" value={data.organizations} caption={`${formatNumber(data.activeOrganizations)} active, ${formatNumber(data.pendingOrganizations)} pending approval`} icon="building" />
        <StatCard label="My employees" value={data.employeesWorking} caption="Working for your organizations" icon="users" to="/manager/employee-pool?view=mine" />
        <StatCard label="Free in the pool" value={data.freeEmployees} caption="Can be assigned to you" icon="sparkles" to="/manager/employee-pool?view=free" />
        <StatCard label="Active contracts" value={data.activeContracts} caption="Contracts of your organizations" icon="file" />
        <StatCard label="Pending requests" value={data.pendingRequests} caption="Staff requests waiting for the admin" icon="inbox" />
        <StatCard label="Open queries" value={data.openQueries} caption="Not resolved yet" icon="alert" />
      </section>

      <div className="dashboard-columns">
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Employees by organization</h3>
          </div>
          <div className="card__body">
            {data.employeesByOrganization.length === 0 ? (
              <EmptyState icon="building" title="No organizations yet" text="The administrator has not assigned any organization to you yet." />
            ) : (
              <ul className="bar-list">
                {data.employeesByOrganization.map((item) => (
                  <li key={item.organizationId}>
                    <div className="bar-list__row">
                      <span>{item.name || `Organization #${item.organizationId}`}</span>
                      <strong>{item.count}</strong>
                    </div>
                    <div className="bar-list__track">
                      <span className="bar-list__fill" style={{ width: `${(item.count / maxOrgCount) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Recent allocation activity</h3>
          </div>
          <div className="card__body">
            {data.recentActivity.length === 0 ? (
              <EmptyState icon="activity" title="No activity yet" text="Assignments, moves and removals in your organizations will be listed here." />
            ) : (
              <ul className="activity-list">
                {data.recentActivity.map((event) => (
                  <li key={event.allocationHistoryId}>
                    <span className="activity-list__icon" aria-hidden="true">
                      <Icon name="activity" size={16} />
                    </span>
                    <div className="activity-list__text">
                      <p>
                        <strong>{event.employee || 'An employee'}</strong> · {humanize(event.actionType)}
                        {(event.from || event.to) && (
                          <span className="cell-muted">
                            {' '}
                            ({event.from || '—'} → {event.to || '—'})
                          </span>
                        )}
                      </p>
                      <p className="cell-muted">
                        {formatTimeAgo(event.actionTime)} · {event.isAllocatedByAi ? 'AI' : 'Manual'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default ManagerDashboardPage
