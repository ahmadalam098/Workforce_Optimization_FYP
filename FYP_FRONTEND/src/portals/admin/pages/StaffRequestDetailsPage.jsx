import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { allocationsApi, organizationsApi, workforceRequestsApi } from '../../../services/adminService.js'
import { formatDate, formatDateTime, humanize } from '../../../utils/format.js'
import AllocateModal from '../components/AllocateModal.jsx'
import DecisionModal from '../components/DecisionModal.jsx'
import Notice from '../components/Notice.jsx'
import { EmptyState, ErrorState } from '../components/StateBox.jsx'
import { PriorityBadge } from '../components/TicketBadges.jsx'
import WorkflowBadge from '../components/WorkflowBadge.jsx'

const DIALOGS = {
  approve: { title: 'Approve request?', description: 'Once approved, employees can be allocated to it.', label: 'Note (optional)', required: false, confirm: 'Approve', run: workforceRequestsApi.approve },
  reject: { title: 'Reject request?', description: 'Explain why. The organization will see it.', label: 'Reason', required: true, confirm: 'Reject', danger: true, run: workforceRequestsApi.reject },
  cancel: { title: 'Cancel request?', description: 'The request is closed. Release any allocated employees first.', label: 'Note (optional)', required: false, confirm: 'Cancel request', danger: true, run: workforceRequestsApi.cancel },
}

function StaffRequestDetailsPage() {
  const { requestId } = useParams()
  const location = useLocation()
  const [notice, setNotice] = useState(location.state?.message ?? '')
  const [actionError, setActionError] = useState('')
  const [dialog, setDialog] = useState(null) // 'approve' | 'reject' | 'cancel'
  const [allocating, setAllocating] = useState(null) // candidate | true (search any)
  const [releasing, setReleasing] = useState(null)

  const { data: request, error, loading, reload } = useFetch((signal) => workforceRequestsApi.get(requestId, signal), `request-${requestId}`)
  const { data: organizations } = useFetch((signal) => organizationsApi.lookup(signal), 'organizations')

  const back = (
    <Link className="back-link" to="/admin/requests">
      <Icon name="arrowLeft" size={16} /> Back to Staff Requests
    </Link>
  )

  if (!request && loading) {
    return (
      <div className="page">
        {back}
        <Spinner label="Loading request..." />
      </div>
    )
  }

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

  const isPending = request.status === 'Pending'
  const isApproved = request.status === 'Approved'
  const warnings = [...(location.state?.warnings ?? []), ...request.warnings].filter((text, index, all) => all.indexOf(text) === index)
  const dialogInfo = dialog ? DIALOGS[dialog] : null

  async function release(allocation) {
    setReleasing(allocation.allocationId)
    setActionError('')
    try {
      const result = await allocationsApi.release(allocation.allocationId, `Released from staff request #${request.requestId}`)
      setNotice(result?.message || 'Employee released.')
      reload()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setReleasing(null)
    }
  }

  return (
    <div className="page">
      {back}
      <Notice message={notice} onClose={() => setNotice('')} />
      {actionError && <Alert type="error" onClose={() => setActionError('')}>{actionError}</Alert>}
      {warnings.map((text) => (
        <Alert key={text} type="info">
          {text}
        </Alert>
      ))}

      <section className="card hero-card">
        <div className="hero-card__main">
          <h2 className="hero-card__title">
            {request.requiredEmployees} {request.requiredEmployees === 1 ? 'employee' : 'employees'} for{' '}
            {request.orgId ? <Link to={`/admin/organizations/${request.orgId}`}>{request.orgName}</Link> : 'an organization'}
          </h2>
          <p className="hero-card__sub">
            {formatDate(request.startDatetime)} – {formatDate(request.endDatetime)} · {request.skillName ? `skill: ${request.skillName}` : 'any skill'} · logged {formatDateTime(request.createdAt)}
          </p>
          <div className="hero-card__badges">
            <WorkflowBadge status={request.status} />
            <PriorityBadge priority={request.priority} />
          </div>
        </div>
        <div className="hero-card__actions">
          {isPending && (
            <>
              <Button onClick={() => setDialog('approve')}>
                <Icon name="checkCircle" size={17} /> Approve
              </Button>
              <Button variant="secondary" onClick={() => setDialog('reject')}>
                <Icon name="close" size={17} /> Reject
              </Button>
            </>
          )}
          {(isPending || isApproved) && (
            <Button variant="secondary" onClick={() => setDialog('cancel')}>
              Cancel request
            </Button>
          )}
        </div>
      </section>

      <div className="details-grid">
        <div className="form-stack">
          <section className="card">
            <div className="card__header">
              <h3 className="card__title">Employees on this request</h3>
              <span className="cell-muted">
                {request.staffedNow} of {request.requiredEmployees} allocated
              </span>
            </div>
            {request.allocations.length === 0 ? (
              <EmptyState icon="users" title="Nobody allocated yet" text={isApproved ? 'Pick from the suggestions below.' : 'Employees can be allocated once the request is approved.'} />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Type</th>
                      <th>Since</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {request.allocations.map((allocation) => (
                      <tr key={allocation.allocationId} className={allocation.isOpen ? '' : 'is-inactive'}>
                        <td>
                          {allocation.employeeId ? (
                            <Link className="person__name" to={`/admin/employees/${allocation.employeeId}`}>
                              {allocation.employeeName}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{allocation.allocationType}</td>
                        <td className="cell-muted cell-date">{formatDateTime(allocation.startDatetime)}</td>
                        <td>{allocation.isOpen ? 'Working' : humanize(allocation.status)}</td>
                        <td className="num">
                          {allocation.isOpen && (
                            <Button variant="secondary" loading={releasing === allocation.allocationId} onClick={() => release(allocation)}>
                              Release
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

          {isApproved && request.stillNeeded > 0 && (
            <section className="card">
              <div className="card__header">
                <h3 className="card__title">Suggested employees</h3>
                <Button variant="secondary" onClick={() => setAllocating(true)}>
                  <Icon name="search" size={16} /> Find another
                </Button>
              </div>
              {request.candidates.length === 0 ? (
                <EmptyState
                  icon="users"
                  title="No matching employee is free"
                  text={request.skillName ? `Nobody available has the ${request.skillName} skill. You can still search all employees.` : 'Nobody is available right now.'}
                />
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Home organization</th>
                        <th>Status</th>
                        <th className="num">Rating</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {request.candidates.map((employee) => (
                        <tr key={employee.employeeId}>
                          <td>
                            <Link className="person__name" to={`/admin/employees/${employee.employeeId}`}>
                              {employee.fullName}
                            </Link>
                            <span className="person__sub">{employee.email}</span>
                          </td>
                          <td>
                            {employee.homeOrgName || <span className="cell-muted">Central pool</span>}
                            {employee.sameOrganization && <span className="person__sub">Same organization (no borrowing needed)</span>}
                          </td>
                          <td>{humanize(employee.availabilityStatus)}</td>
                          <td className="num">{employee.rating ?? '—'}</td>
                          <td className="num">
                            <Button onClick={() => setAllocating(employee)}>Allocate</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="form-stack">
          <section className="card">
            <div className="card__header">
              <h3 className="card__title">Request</h3>
            </div>
            <div className="card__body">
              <p style={{ margin: '0 0 1rem' }}>{request.reason || '—'}</p>
              {request.contract ? (
                <dl className="info-list">
                  <div className="info-item">
                    <dt>Contract</dt>
                    <dd>
                      <Link to={`/admin/contracts/${request.contract.contractId}`}>#{request.contract.contractId}</Link>
                    </dd>
                  </div>
                  <div className="info-item">
                    <dt>Contract allows</dt>
                    <dd>
                      {request.contract.minEmployees ?? '—'} – {request.contract.maxEmployees ?? '—'} employees
                    </dd>
                  </div>
                  <div className="info-item">
                    <dt>Working there now</dt>
                    <dd>{request.contract.allocatedToOrganizationNow}</dd>
                  </div>
                </dl>
              ) : (
                <p className="cell-muted">No contract is linked to this request.</p>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card__header">
              <h3 className="card__title">Decisions</h3>
            </div>
            <div className="card__body">
              {request.reviews.length === 0 ? (
                <p className="cell-muted">No decision yet.</p>
              ) : (
                <ul className="decision-list">
                  {request.reviews.map((review, index) => (
                    <li key={index}>
                      <strong>{review.decision}</strong> by {review.reviewedBy || 'an admin'}
                      <span className="cell-muted"> · {formatDateTime(review.reviewedAt)}</span>
                      {review.note && <p style={{ margin: '0.25rem 0 0' }}>{review.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      {dialogInfo && (
        <DecisionModal
          title={dialogInfo.title}
          description={dialogInfo.description}
          label={dialogInfo.label}
          required={dialogInfo.required}
          danger={dialogInfo.danger}
          confirmLabel={dialogInfo.confirm}
          onSubmit={async (text) => {
            const result = await dialogInfo.run(request.requestId, text || undefined)
            setDialog(null)
            setNotice(result?.message || 'Done.')
            reload()
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {allocating && (
        <AllocateModal
          organizations={organizations ?? []}
          staffRequest={{ requestId: request.requestId, orgId: request.orgId, orgName: request.orgName, endDatetime: request.endDatetime }}
          presetEmployee={allocating === true ? undefined : { employeeId: allocating.employeeId, fullName: allocating.fullName, homeOrgName: allocating.homeOrgName, availabilityStatus: allocating.availabilityStatus }}
          onClose={() => setAllocating(null)}
          onDone={(message) => {
            setAllocating(null)
            setNotice(message)
            reload()
          }}
        />
      )}
    </div>
  )
}

export default StaffRequestDetailsPage
