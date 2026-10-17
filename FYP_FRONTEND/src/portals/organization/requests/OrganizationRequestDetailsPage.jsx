import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { organizationRequestsApi } from '../../../services/organization/organizationService.js'
import { formatDateTime } from '../../../utils/format.js'
import { PriorityBadge } from '../../admin/queries/TicketBadges.jsx'
import Notice from '../../admin/shared/Notice.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import WorkflowBadge from '../../admin/shared/WorkflowBadge.jsx'

function InfoItem({ label, children }) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd>{children || <span className="cell-muted">—</span>}</dd>
    </div>
  )
}

/** Organization: one request for extra employees - the manager's decision, and who works on it. */
function OrganizationRequestDetailsPage() {
  const { requestId } = useParams()
  const [notice, setNotice] = useFlashNotice()
  const [cancelling, setCancelling] = useState(false)
  const [problem, setProblem] = useState('')
  const { data: request, error, loading, reload } = useFetch((signal) => organizationRequestsApi.get(requestId, signal), `organization-request-${requestId}`)

  const back = (
    <Link className="back-link" to="/organization/requests">
      <Icon name="arrowLeft" size={16} /> Back to Staff Requests
    </Link>
  )

  if (!request && loading) return <Spinner label="Loading the request..." />
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

  async function cancel() {
    setCancelling(true)
    setProblem('')
    try {
      const result = await organizationRequestsApi.cancel(requestId)
      setNotice(result?.message || 'Cancelled.')
      reload()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="page">
      {back}
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card hero-card">
        <div className="hero-card__main">
          <h2 className="hero-card__title">Request #{request.requestId}</h2>
          <p className="hero-card__sub">
            {request.requiredEmployees} extra employee{request.requiredEmployees === 1 ? '' : 's'}
            {request.skillName && <> · {request.skillName}</>} · {formatDateTime(request.startDatetime)} – {formatDateTime(request.endDatetime)}
          </p>
          <div className="hero-card__badges">
            <WorkflowBadge status={request.status} />
            <PriorityBadge priority={request.priority} />
          </div>
        </div>
        {request.canCancel && (
          <div className="hero-card__actions">
            <Button variant="secondary" onClick={cancel} loading={cancelling}>
              Cancel this request
            </Button>
          </div>
        )}
      </section>

      {problem && <Alert type="error" onClose={() => setProblem('')}>{problem}</Alert>}
      {request.status === 'Pending' && <Alert type="info">Your organization manager has not decided yet. You will get an email when they do.</Alert>}
      {request.status === 'Approved' && request.staffedNow < request.requiredEmployees && (
        <Alert type="info">Approved. Your manager is choosing the employees: {request.staffedNow} of {request.requiredEmployees} are working for you so far.</Alert>
      )}

      <div className="details-grid">
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Request</h3>
          </div>
          <dl className="card__body info-list">
            <InfoItem label="Reason">{request.reason}</InfoItem>
            <InfoItem label="Asked">{formatDateTime(request.createdAt)}</InfoItem>
            <InfoItem label="Working for you now">
              {request.staffedNow} of {request.requiredEmployees}
            </InfoItem>
          </dl>
        </section>

        <div className="form-stack">
          <section className="card">
            <div className="card__header">
              <h3 className="card__title">The manager&apos;s decision</h3>
            </div>
            {request.decisions.length === 0 ? (
              <div className="card__body">
                <EmptyState icon="clock" title="No decision yet" text="The decision and the reason will appear here." />
              </div>
            ) : (
              <ul className="card__body plain-list">
                {request.decisions.map((decision) => (
                  <li key={`${decision.decision}-${decision.reviewedAt}`}>
                    <strong>{decision.decision}</strong> <span className="cell-muted">· {decision.reviewedBy} · {formatDateTime(decision.reviewedAt)}</span>
                    {decision.note && <p style={{ margin: '0.25rem 0 0' }}>{decision.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {request.staff.length > 0 && (
            <section className="card">
              <div className="card__header">
                <h3 className="card__title">Employees working on it</h3>
              </div>
              <div className="card__body chip-list">
                {request.staff.map((person) => (
                  <span className="chip" key={`${person.name}-${person.since}`}>
                    {person.name}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

export default OrganizationRequestDetailsPage
