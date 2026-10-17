import Badge from '../../../components/ui/Badge.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useAuth } from '../../../context/useAuth.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { employeeApi } from '../../../services/employee/employeeService.js'
import { formatDate, humanize } from '../../../utils/format.js'
import { greeting } from '../../admin/dashboard/dashboardUtils.js'
import StatCard from '../../admin/shared/StatCard.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import '../../admin/dashboard/AdminDashboardPage.css'

function InfoItem({ label, children }) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd>{children || <span className="cell-muted">—</span>}</dd>
    </div>
  )
}

/** First page of the Employee portal (a starting page for now). Same layout, colours and fonts as the other portals. */
function EmployeeDashboardPage() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useFetch((signal) => employeeApi.overview(signal), 'employee-overview')

  if (!data && loading) return <Spinner label="Loading dashboard..." />
  if (!data) {
    return (
      <div className="card">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  const firstName = (data.fullName || user?.fullName || 'there').split(' ')[0]
  const skills = data.skills ?? []

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div className="dashboard-hero__text">
          <p className="dashboard-hero__eyebrow">{greeting()}</p>
          <h2 className="dashboard-hero__title">Welcome, {firstName}</h2>
          <p className="dashboard-hero__summary">
            {data.workingOrganization ? (
              <>
                You are working for <strong>{data.workingOrganization}</strong> right now.
              </>
            ) : (
              <>You are not assigned to an organization at the moment. Your shifts, assignments and salary will appear here soon.</>
            )}
          </p>
        </div>
      </section>

      {data.hasEmployeeRecord ? (
        <>
          <section className="stat-grid" aria-label="Key facts">
            <StatCard label="My skills" value={skills.length} caption="Added by the admin" icon="sparkles" />
            <StatCard label="Employee ID" value={data.employeeId} caption="Your number in the system" icon="users" />
          </section>

          <div className="dashboard-columns">
            <section className="card">
              <div className="card__header">
                <h3 className="card__title">My details</h3>
              </div>
              <dl className="card__body info-list">
                <InfoItem label="Name">{data.fullName}</InfoItem>
                <InfoItem label="Email">{data.email}</InfoItem>
                <InfoItem label="Phone">{data.phone}</InfoItem>
                <InfoItem label="Joined">{data.joiningDate ? formatDate(data.joiningDate) : null}</InfoItem>
                <InfoItem label="Status">{data.availabilityStatus ? <Badge tone="info">{humanize(data.availabilityStatus)}</Badge> : null}</InfoItem>
                <InfoItem label="Home organization">{data.homeOrganization}</InfoItem>
                <InfoItem label="Working for">{data.workingOrganization}</InfoItem>
                <InfoItem label="Shift today">{data.shift ? `${data.shift.name} (${String(data.shift.start).slice(0, 5)} – ${String(data.shift.end).slice(0, 5)})` : null}</InfoItem>
              </dl>
            </section>

            <section className="card">
              <div className="card__header">
                <h3 className="card__title">My skills</h3>
              </div>
              <div className="card__body">
                {skills.length === 0 ? (
                  <EmptyState icon="sparkles" title="No skills yet" text="The admin adds your skills." />
                ) : (
                  <ul className="activity-list">
                    {skills.map((skill) => (
                      <li key={skill.name}>
                        <div className="activity-list__text">
                          <p>
                            <strong>{skill.name}</strong> <span className="cell-muted">· {skill.proficiency}</span>
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </>
      ) : (
        <section className="card">
          <div className="card__body">
            <EmptyState icon="users" title="Your employee profile is not set up yet" text="Please ask the admin to complete your employee record." />
          </div>
        </section>
      )}
    </div>
  )
}

export default EmployeeDashboardPage
