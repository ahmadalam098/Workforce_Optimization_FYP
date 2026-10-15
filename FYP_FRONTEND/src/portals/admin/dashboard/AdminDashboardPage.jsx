import { Link } from 'react-router-dom'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useAuth } from '../../../context/useAuth.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { dashboardApi } from '../../../services/admin/adminService.js'
import { formatNumber, formatTimeAgo, humanize } from '../../../utils/format.js'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'
import StatCard from '../shared/StatCard.jsx'
import { greeting, STATUS_COLORS } from './dashboardUtils.js'
import './AdminDashboardPage.css'

function AdminDashboardPage() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useFetch((signal) => dashboardApi.summary(signal), 'dashboard')

  if (!data && loading) return <Spinner label="Loading dashboard..." />
  if (!data) {
    return (
      <div className="card">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  const firstName = (user?.fullName || 'Admin').split(' ')[0]
  const availabilityTotal = data.availability.reduce((sum, item) => sum + item.count, 0)
  const maxOrgCount = Math.max(1, ...data.employeesByOrganization.map((item) => item.count))

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div className="dashboard-hero__text">
          <p className="dashboard-hero__eyebrow">{greeting()}</p>
          <h2 className="dashboard-hero__title">Welcome back, {firstName}</h2>
          <p className="dashboard-hero__summary">
            <strong>{formatNumber(data.availableEmployees)}</strong> of {formatNumber(data.activeEmployees)} active employees are available right now
            {data.pendingRequests > 0 && (
              <>
                {' '}
                and <strong>{formatNumber(data.pendingRequests)}</strong> <Link to="/admin/requests">staff {data.pendingRequests === 1 ? 'request is' : 'requests are'} waiting</Link>.
              </>
            )}
            {data.pendingRequests === 0 && '.'}
          </p>
          <div className="dashboard-hero__actions">
            <Link to="/admin/employees" className="hero-btn hero-btn--dark">
              <Icon name="plus" size={17} /> Manage employees
            </Link>
            <Link to="/admin/team" className="hero-btn">
              <Icon name="team" size={17} /> Manage team
            </Link>
          </div>
        </div>

        <div className="dashboard-hero__panel" aria-label="Availability overview">
          <p className="dashboard-hero__panel-title">Workforce availability</p>
          {availabilityTotal === 0 ? (
            <p className="dashboard-hero__panel-empty">No active employees yet.</p>
          ) : (
            <>
              <div className="segment-bar" role="img" aria-label="Employees by availability status">
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
        <StatCard label="Total employees" value={data.activeEmployees} caption={`${formatNumber(data.totalEmployees)} on record`} icon="users" to="/admin/employees" />
        <StatCard label="Active organizations" value={data.activeOrganizations} caption={`${formatNumber(data.pendingOrganizations)} pending approval`} icon="building" to="/admin/organizations" />
        <StatCard label="Available now" value={data.availableEmployees} caption={`${formatNumber(data.unassignedEmployees)} in the central pool`} icon="sparkles" />
        <StatCard label="Pending requests" value={data.pendingRequests} caption="Workforce requests to review" icon="inbox" />
        <StatCard label="Active contracts" value={data.activeContracts} caption={`${formatNumber(data.pendingContracts)} awaiting approval`} icon="file" to="/admin/contracts" />
        <StatCard label="Active allocations" value={data.activeAllocations} caption="Employees working for organizations" icon="swap" to="/admin/allocations" />
        <StatCard label="Organization managers" value={data.totalManagers} caption="Active manager accounts" icon="team" to="/admin/team?tab=managers" />
      </section>

      <div className="dashboard-columns">
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Employees by organization</h3>
          </div>
          <div className="card__body">
            {data.employeesByOrganization.length === 0 ? (
              <EmptyState icon="building" title="No assignments yet" text="Employees assigned to organizations will show up here." />
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
              <EmptyState icon="activity" title="No activity yet" text="Allocations and reassignments will be listed here." />
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

export default AdminDashboardPage
