import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { managerRequestsApi } from '../../../services/manager/managerService.js'
import { formatDateTime } from '../../../utils/format.js'
import '../../admin/finance/FinanceTiles.css'
import { PriorityBadge } from '../../admin/queries/TicketBadges.jsx'
import Notice from '../../admin/shared/Notice.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import WorkflowBadge from '../../admin/shared/WorkflowBadge.jsx'
import DecisionModal from '../../admin/shared/DecisionModal.jsx'
import ManagerAllocationModal from '../allocations/ManagerAllocationModal.jsx'
import RequestStaffPicker from './RequestStaffPicker.jsx'

function InfoItem({ label, children }) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd>{children || <span className="cell-muted">—</span>}</dd>
    </div>
  )
}

/** Organization Manager: one staff request, who is allocated to it, and the pool to staff it by hand. */
function ManagerRequestDetailsPage() {
  const { requestId } = useParams()
  const [notice, setNotice] = useFlashNotice()
  const [removing, setRemoving] = useState(null)
  const [deciding, setDeciding] = useState(null) // 'approve' | 'reject'
  const { data: request, error, loading, reload } = useFetch((signal) => managerRequestsApi.get(requestId, signal), `manager-request-${requestId}`)

  const back = (
    <Link className="back-link" to="/manager/requests">
      <Icon name="arrowLeft" size={16} /> Back to Staff Requests
    </Link>
  )

  if (!request && loading) return <Spinner label="Loading request..." />
  if (!request) {
    return (
      <div className="page">
        {back}
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      </div>
    )
  }

  const contract = request.contract
  const open = request.allocations.filter((allocation) => allocation.isOpen)

  return (
    <div className="page">
      {back}
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card hero-card">
        <div className="hero-card__main">
          <h2 className="hero-card__title">{request.orgName}</h2>
          <p className="hero-card__sub">
            {request.requiredEmployees} employee{request.requiredEmployees === 1 ? '' : 's'}
            {request.skillName && <> · {request.skillName}</>} · {formatDateTime(request.startDatetime)} – {formatDateTime(request.endDatetime)}
          </p>
          <div className="hero-card__badges">
            <WorkflowBadge status={request.status} />
            <PriorityBadge priority={request.priority} />
          </div>
        </div>
        {request.canDecide && (
          <div className="hero-card__actions">
            <Button onClick={() => setDeciding('approve')}>
              <Icon name="checkCircle" size={17} /> Approve
            </Button>
            <Button variant="secondary" onClick={() => setDeciding('reject')}>
              <Icon name="close" size={17} /> Reject
            </Button>
          </div>
        )}
      </section>

      {request.status === 'Pending' && <Alert type="info">This request is waiting for your decision. Approve or reject it; allocating an employee to it below also approves it.</Alert>}
      {request.warnings.map((warning) => (
        <Alert type="warning" key={warning}>
          {warning}
        </Alert>
      ))}

      <section className="finance-tiles" aria-label="Staffing">
        <article className="card finance-tile">
          <p className="finance-tile__label">Needed</p>
          <p className="finance-tile__value">{request.requiredEmployees}</p>
        </article>
        <article className="card finance-tile">
          <p className="finance-tile__label">Staffed now</p>
          <p className="finance-tile__value">{request.staffedNow}</p>
        </article>
        <article className={`card finance-tile ${request.stillNeeded > 0 && request.status === 'Approved' ? 'finance-tile--gold' : ''}`}>
          <p className="finance-tile__label">Still needed</p>
          <p className="finance-tile__value">{request.stillNeeded}</p>
        </article>
        {contract && (
          <article className="card finance-tile">
            <p className="finance-tile__label">Contract {contract.contractNumber}</p>
            <p className="finance-tile__value">
              {contract.minEmployees ?? 0} – {contract.maxEmployees ?? 'any'}
            </p>
            <p className="finance-tile__caption">{contract.allocatedToOrganizationNow} employees at the organization now</p>
          </article>
        )}
      </section>

      <div className="details-grid">
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Request</h3>
          </div>
          <dl className="card__body info-list">
            <InfoItem label="Reason">{request.reason}</InfoItem>
            <InfoItem label="Logged">{formatDateTime(request.createdAt)}</InfoItem>
            <InfoItem label="Borrowing employees">{contract ? (contract.borrowingAllowed ? 'Allowed by the contract' : 'Not allowed by the contract') : null}</InfoItem>
          </dl>
        </section>
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Decision</h3>
          </div>
          {request.reviews.length === 0 ? (
            <div className="card__body">
              <EmptyState icon="clock" title="No decision yet" text="Nobody has decided on this request yet." />
            </div>
          ) : (
            <ul className="card__body" style={{ margin: 0, paddingLeft: '1.2rem' }}>
              {request.reviews.map((review) => (
                <li key={`${review.decision}-${review.reviewedAt}`}>
                  <strong>{review.decision}</strong> by {review.reviewedBy} on {formatDateTime(review.reviewedAt)}
                  {review.note && <span className="cell-muted"> - {review.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Employees allocated to this request</h3>
        </div>
        {request.allocations.length === 0 ? (
          <div className="card__body">
            <EmptyState icon="users" title="Nobody yet" text="Employees you allocate to this request will be listed here." />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Type</th>
                  <th>From</th>
                  <th>Until</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {request.allocations.map((allocation) => (
                  <tr key={allocation.allocationId} className={allocation.isOpen ? '' : 'is-inactive'}>
                    <td>
                      <Link to={`/manager/employees/${allocation.employeeId}`}>{allocation.employeeName}</Link>
                    </td>
                    <td>{allocation.allocationType === 'Temporary' ? 'Borrowed' : allocation.allocationType}</td>
                    <td className="cell-muted">{formatDateTime(allocation.startDatetime)}</td>
                    <td className="cell-muted">{allocation.expectedEndDatetime ? formatDateTime(allocation.expectedEndDatetime) : '—'}</td>
                    <td>{allocation.isOpen ? <Badge tone="success">Working</Badge> : <Badge tone="neutral">{allocation.status}</Badge>}</td>
                    <td>
                      {allocation.isOpen && (
                        <Button variant="secondary" onClick={() => setRemoving({ allocationId: allocation.allocationId, employeeId: allocation.employeeId, fullName: allocation.employeeName, workingOrgId: request.orgId, workingOrgName: request.orgName })}>
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {request.canStaff && (
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Employee pool - allocate employees to this request</h3>
          </div>
          <div className="card__body">
            <RequestStaffPicker
              request={request}
              onStaffed={(message) => {
                setNotice(message)
                reload()
              }}
            />
          </div>
        </section>
      )}
      {!request.canStaff && request.status === 'Approved' && open.length >= request.requiredEmployees && <Alert type="success">This request is fully staffed.</Alert>}

      {deciding === 'approve' && (
        <DecisionModal
          title="Approve this request?"
          description="The organization is told. After this you choose the employees for it from the free pool."
          label="Note for the organization (optional)"
          confirmLabel="Approve"
          onSubmit={async (note) => {
            const result = await managerRequestsApi.approve(request.requestId, note || undefined)
            setDeciding(null)
            setNotice(result?.message || 'Approved.')
            reload()
          }}
          onClose={() => setDeciding(null)}
        />
      )}
      {deciding === 'reject' && (
        <DecisionModal
          title="Reject this request?"
          description="The organization sees your reason."
          label="Why is it rejected?"
          required
          danger
          confirmLabel="Reject"
          onSubmit={async (note) => {
            const result = await managerRequestsApi.reject(request.requestId, note)
            setDeciding(null)
            setNotice(result?.message || 'Rejected.')
            reload()
          }}
          onClose={() => setDeciding(null)}
        />
      )}

      {removing && (
        <ManagerAllocationModal
          mode="release"
          employee={removing}
          organizations={[]}
          onClose={() => setRemoving(null)}
          onDone={(message) => {
            setRemoving(null)
            setNotice(message)
            reload()
          }}
        />
      )}
    </div>
  )
}

export default ManagerRequestDetailsPage
