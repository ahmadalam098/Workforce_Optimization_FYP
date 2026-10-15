import { Link, useParams } from 'react-router-dom'
import Avatar from '../../../components/ui/Avatar.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { managerInfoApi } from '../../../services/manager/managerService.js'
import { formatDate, formatDateTime } from '../../../utils/format.js'
import '../../admin/finance/FinanceTiles.css'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import { AvailabilityBadge } from '../../admin/shared/StatusBadge.jsx'
import WorkflowBadge from '../../admin/shared/WorkflowBadge.jsx'

function InfoItem({ label, children }) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd>{children || <span className="cell-muted">—</span>}</dd>
    </div>
  )
}

/** Organization Manager: one of my organizations - its information, contract, managers and the employees working there. */
function ManagerOrganizationDetailsPage() {
  const { orgId } = useParams()
  const { data: org, error, loading, reload } = useFetch((signal) => managerInfoApi.organization(orgId, signal), `manager-organization-${orgId}`)

  const back = (
    <Link className="back-link" to="/manager/organizations">
      <Icon name="arrowLeft" size={16} /> Back to My Organizations
    </Link>
  )

  if (!org && loading) return <Spinner label="Loading..." />
  if (!org) {
    return (
      <div className="page">
        {back}
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      </div>
    )
  }

  const contract = org.contract

  return (
    <div className="page">
      {back}

      <section className="card hero-card">
        <div className="hero-card__main">
          <h2 className="hero-card__title">{org.name}</h2>
          <p className="hero-card__sub">
            {org.email || 'No email'}
            {org.phone && <> · {org.phone}</>}
          </p>
          <div className="hero-card__badges">
            <WorkflowBadge status={org.status} />
            {org.createdAt && <span className="cell-muted">Registered {formatDate(org.createdAt)}</span>}
          </div>
        </div>
      </section>

      <section className="finance-tiles" aria-label="Overview">
        <article className="card finance-tile">
          <p className="finance-tile__label">Employees working</p>
          <p className="finance-tile__value">{org.employees.length}</p>
          <p className="finance-tile__caption">{contract?.maxEmployees != null ? `of ${contract.maxEmployees} allowed by the contract` : 'no limit set'}</p>
        </article>
        <article className="card finance-tile">
          <p className="finance-tile__label">Open queries</p>
          <p className="finance-tile__value">{org.openQueries}</p>
          <p className="finance-tile__caption">from the organization</p>
        </article>
        <article className={`card finance-tile ${org.openComplaints > 0 ? 'finance-tile--danger' : ''}`}>
          <p className="finance-tile__label">Open complaints</p>
          <p className="finance-tile__value">{org.openComplaints}</p>
          <p className="finance-tile__caption">from the organization</p>
        </article>
        <article className="card finance-tile">
          <p className="finance-tile__label">Employee queries</p>
          <p className="finance-tile__value">{org.openEmployeeQueries}</p>
          <p className="finance-tile__caption">
            open (<Link to="/manager/queries">see them</Link>)
          </p>
        </article>
      </section>

      <div className="details-grid">
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Organization information</h3>
          </div>
          <dl className="card__body info-list">
            <InfoItem label="Name">{org.name}</InfoItem>
            <InfoItem label="Email">{org.email}</InfoItem>
            <InfoItem label="Phone">{org.phone}</InfoItem>
            <InfoItem label="Address">{org.address}</InfoItem>
            <InfoItem label="Country">{org.country}</InfoItem>
            <InfoItem label="Approved">{org.approvedAt ? formatDate(org.approvedAt) : null}</InfoItem>
          </dl>
        </section>

        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Active contract</h3>
          </div>
          {contract ? (
            <dl className="card__body info-list">
              <InfoItem label="Contract">{contract.contractNumber}</InfoItem>
              <InfoItem label="Period">
                {contract.startDate ? formatDate(contract.startDate) : '—'} – {contract.endDate ? formatDate(contract.endDate) : 'open'}
              </InfoItem>
              <InfoItem label="Employees">
                {contract.minEmployees != null || contract.maxEmployees != null ? `${contract.minEmployees ?? 0} to ${contract.maxEmployees ?? 'any'}` : null}
              </InfoItem>
              <InfoItem label="Borrowing employees">{contract.borrowingAllowed == null ? null : contract.borrowingAllowed ? 'Allowed' : 'Not allowed'}</InfoItem>
              <InfoItem label="Priority">{contract.priorityLevel}</InfoItem>
              <InfoItem label="Billing">{contract.billingCurrency ? `${contract.billingCurrency}${contract.billingCycle ? ` · ${contract.billingCycle}` : ''}` : null}</InfoItem>
            </dl>
          ) : (
            <div className="card__body">
              <EmptyState icon="file" title="No active contract" text="Employees can only be assigned once the organization has an active contract." />
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Managers</h3>
        </div>
        <ul className="card__body" style={{ margin: 0, paddingLeft: '1.2rem' }}>
          {org.managers.map((manager) => (
            <li key={manager.userId}>
              <strong>{manager.fullName}</strong> {manager.isMe && <Badge tone="gold">You</Badge>} <span className="cell-muted">{manager.email}</span>
              {!manager.isActive && <span className="cell-muted"> · inactive</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Employees working here</h3>
        </div>
        {org.employees.length === 0 ? (
          <div className="card__body">
            <EmptyState icon="users" title="Nobody works here yet" text="Assign employees from the Employee Pool." />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Status</th>
                  <th>Home organization</th>
                  <th>Here since</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>
                {org.employees.map((employee) => (
                  <tr key={employee.employeeId}>
                    <td>
                      <div className="person">
                        <Avatar userId={employee.userId} name={employee.fullName} hasPicture={employee.hasPicture} />
                        <span>
                          <span className="person__name">{employee.fullName}</span>
                          {employee.isBorrowed && <span className="person__sub">Borrowed</span>}
                        </span>
                      </div>
                    </td>
                    <td>
                      <AvailabilityBadge status={employee.availabilityStatus} />
                    </td>
                    <td>{employee.homeOrgName || <span className="cell-muted">Central pool</span>}</td>
                    <td className="cell-muted">{employee.since ? formatDateTime(employee.since) : '—'}</td>
                    <td>
                      <Link className="view-btn" to={`/manager/employees/${employee.employeeId}`} aria-label={`View ${employee.fullName}`}>
                        <Icon name="eye" size={16} /> View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default ManagerOrganizationDetailsPage
