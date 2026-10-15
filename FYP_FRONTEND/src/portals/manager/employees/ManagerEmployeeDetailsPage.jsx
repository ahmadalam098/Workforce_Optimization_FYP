import { Link, useParams } from 'react-router-dom'
import Avatar from '../../../components/ui/Avatar.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { managerInfoApi, managerSalariesApi } from '../../../services/manager/managerService.js'
import { SalaryStatusBadge } from '../salaries/SalaryStatusBadge.jsx'
import { MONTH_OPTIONS } from '../../../constants/billing.js'
import { formatCurrency, formatDate, formatDateTime, humanize } from '../../../utils/format.js'
import { PriorityBadge, TicketStatusBadge } from '../../admin/queries/TicketBadges.jsx'
import '../../admin/dashboard/AdminDashboardPage.css'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import { AvailabilityBadge } from '../../admin/shared/StatusBadge.jsx'

/** The salary and the last 12 months of payroll status of one of my own employees. */
function SalaryCard({ employeeId }) {
  const { data, error, loading, reload } = useFetch((signal) => managerSalariesApi.employee(employeeId, signal), `manager-salary-${employeeId}`)
  const monthName = (month) => MONTH_OPTIONS.find((option) => option.value === String(month))?.label ?? month

  return (
    <section className="card">
      <div className="card__header">
        <h3 className="card__title">Salary status</h3>
      </div>
      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data && loading ? (
        <Spinner label="Loading salary..." />
      ) : (
        <>
          <p className="card__body">
            Monthly salary: <strong>{data.monthlySalary != null ? formatCurrency(data.monthlySalary, data.currency || 'PKR') : 'not set yet'}</strong>
            {data.since && <span className="cell-muted"> (since {formatDate(data.since)})</span>}
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Status</th>
                  <th className="num">Amount</th>
                  <th>Paid on</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((row) => (
                  <tr key={`${row.year}-${row.month}`}>
                    <td>
                      {monthName(row.month)} {row.year}
                    </td>
                    <td>
                      <SalaryStatusBadge status={row.status} label={row.statusLabel} />
                    </td>
                    <td className="num">{row.totalAmount != null ? formatCurrency(row.totalAmount, row.currency || 'PKR') : <span className="cell-muted">—</span>}</td>
                    <td className="cell-muted">{row.paidAt ? formatDate(row.paidAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function InfoItem({ label, children }) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd>{children || <span className="cell-muted">—</span>}</dd>
    </div>
  )
}

/** Organization Manager: one employee - where they work, skills, shift, history with my organizations, and their queries. Never CNIC or passwords; the salary card is shown only for my own employees. */
function ManagerEmployeeDetailsPage() {
  const { employeeId } = useParams()
  const { data: employee, error, loading, reload } = useFetch((signal) => managerInfoApi.employee(employeeId, signal), `manager-employee-${employeeId}`)

  const back = (
    <Link className="back-link" to="/manager/employee-pool">
      <Icon name="arrowLeft" size={16} /> Back to Employee Pool
    </Link>
  )

  if (!employee && loading) return <Spinner label="Loading..." />
  if (!employee) {
    return (
      <div className="page">
        {back}
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {back}

      <section className="card hero-card">
        <div className="hero-card__main" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Avatar userId={employee.userId} name={employee.fullName} hasPicture={employee.hasPicture} size="xl" />
          <div>
            <h2 className="hero-card__title">{employee.fullName}</h2>
            <p className="hero-card__sub">EMP-{String(employee.employeeId).padStart(3, '0')}</p>
            <div className="hero-card__badges">
              <AvailabilityBadge status={employee.availabilityStatus} />
              {employee.rating != null && <Badge tone="gold">★ {Number(employee.rating).toFixed(1)}</Badge>}
              {employee.isAllocated ? <Badge tone="info">Working at {employee.workingOrgName}</Badge> : <Badge tone="success">Free in the pool</Badge>}
              {employee.isBorrowed && <Badge tone="warning">Borrowed</Badge>}
            </div>
          </div>
        </div>
      </section>

      <div className="details-grid">
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Employee information</h3>
          </div>
          <dl className="card__body info-list">
            <InfoItem label="Email">{employee.email}</InfoItem>
            <InfoItem label="Phone">{employee.phone}</InfoItem>
            <InfoItem label="Country">{employee.country}</InfoItem>
            <InfoItem label="Joined">{employee.joiningDate ? formatDate(employee.joiningDate) : null}</InfoItem>
            <InfoItem label="Home organization">{employee.homeOrgName || 'Central pool'}</InfoItem>
            <InfoItem label="Shift">{employee.shift ? `${employee.shift.name} (${String(employee.shift.start).slice(0, 5)} - ${String(employee.shift.end).slice(0, 5)})` : null}</InfoItem>
          </dl>
          {!employee.isMine && <p className="card__body cell-muted">Contact details are shown only for employees who work for your organizations.</p>}
        </section>

        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Where they work now</h3>
          </div>
          <dl className="card__body info-list">
            <InfoItem label="Organization">{employee.workingOrgName}</InfoItem>
            <InfoItem label="Since">{employee.workingSince ? formatDateTime(employee.workingSince) : null}</InfoItem>
            <InfoItem label="Planned end">{employee.expectedEnd ? formatDateTime(employee.expectedEnd) : null}</InfoItem>
          </dl>
          {employee.canManage && (
            <p className="card__body">
              <Link to="/manager/employee-pool?view=mine">Move or remove this employee in the Employee Pool</Link>
            </p>
          )}
          {!employee.isAllocated && (
            <p className="card__body">
              <Link to="/manager/employee-pool?view=free">Assign this employee in the Employee Pool</Link>
            </p>
          )}
        </section>
      </div>

      {employee.isMine && <SalaryCard employeeId={employee.employeeId} />}

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Skills</h3>
        </div>
        {employee.skills.length === 0 ? (
          <div className="card__body">
            <EmptyState icon="sparkles" title="No skills recorded" />
          </div>
        ) : (
          <div className="card__body chip-list">
            {employee.skills.map((skill) => (
              <span className="chip" key={skill.name}>
                {skill.name} · {skill.proficiency}
                {skill.years != null && ` · ${skill.years} yr`}
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="details-grid">
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">History with your organizations</h3>
          </div>
          {employee.history.length === 0 ? (
            <div className="card__body">
              <EmptyState icon="activity" title="Nothing yet" text="Assignments, moves and removals in your organizations will be listed here." />
            </div>
          ) : (
            <ul className="activity-list card__body">
              {employee.history.map((event) => (
                <li key={event.allocationHistoryId}>
                  <span className="activity-list__icon" aria-hidden="true">
                    <Icon name="activity" size={16} />
                  </span>
                  <div className="activity-list__text">
                    <p>
                      <strong>{humanize(event.actionType)}</strong>
                      {(event.from || event.to) && (
                        <span className="cell-muted">
                          {' '}
                          ({event.from || '—'} → {event.to || '—'})
                        </span>
                      )}
                    </p>
                    <p className="cell-muted">
                      {formatDateTime(event.actionTime)} · {event.isAi ? 'AI' : 'Manual'}
                      {event.actionReason && ` · ${event.actionReason}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Their queries</h3>
          </div>
          {employee.queries.length === 0 ? (
            <div className="card__body">
              <EmptyState icon="inbox" title="No queries" text="Queries this employee asked will be listed here." />
            </div>
          ) : (
            <ul className="card__body" style={{ margin: 0, paddingLeft: '1.2rem' }}>
              {employee.queries.map((query) => (
                <li key={query.ticketId}>
                  <Link to={`/manager/queries/${query.ticketId}`}>
                    <strong>{query.subject}</strong>
                  </Link>{' '}
                  <span className="cell-muted">{query.ticketNumber}</span> <PriorityBadge priority={query.priority} /> <TicketStatusBadge status={query.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

export default ManagerEmployeeDetailsPage
