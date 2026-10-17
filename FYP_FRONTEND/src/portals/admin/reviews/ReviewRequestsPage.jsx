import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import ReviewList from '../../../components/reviews/ReviewList.jsx'
import { Stars } from '../../../components/reviews/Stars.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { reviewEscalationsApi } from '../../../services/admin/adminService.js'
import { formatDate, formatDateTime } from '../../../utils/format.js'
import { validateText } from '../../../utils/validators.js'
import Notice from '../shared/Notice.jsx'
import PageHeader from '../shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'

const ACTIONS = [
  { value: 'Warn', label: 'Warn the employee' },
  { value: 'Deactivate', label: 'Deactivate the employee (removed from the organizations, cannot sign in)' },
  { value: 'Dismiss', label: 'No action' },
]

function DecideModal({ item, onClose, onDone }) {
  const { data: detail, error, loading } = useFetch((signal) => reviewEscalationsApi.get(item.escalationId, signal), `escalation-${item.escalationId}`)
  const [action, setAction] = useState('Warn')
  const [response, setResponse] = useState('')
  const [problem, setProblem] = useState('')
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const text = validateText(response, { label: 'Your comment', required: true, min: 5, max: 500 })
    setProblem(text)
    if (text) return
    setSubmitting(true)
    setServerError('')
    try {
      const result = await reviewEscalationsApi.decide(item.escalationId, { action, response: response.trim() })
      onDone(result?.message || 'Done.')
    } catch (err) {
      setServerError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Decide about ${item.employeeName}`}
      subtitle={`Asked by the manager of ${item.organizationName}`}
      size="lg"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="escalation-form" loading={submitting} className={action === 'Deactivate' ? 'btn--danger' : ''}>
            Confirm
          </Button>
        </>
      }
    >
      <form id="escalation-form" onSubmit={submit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <p>
          <strong>Review:</strong> <Stars value={item.rating} /> - {item.comment}
        </p>
        <p>
          <strong>Manager&apos;s message:</strong> {item.managerNote}
        </p>
        {error && !detail ? (
          <ErrorState error={error} />
        ) : !detail && loading ? (
          <Spinner label="Loading..." />
        ) : (
          <>
            <p className="cell-muted">
              Overall rating {detail.employee?.rating != null ? Number(detail.employee.rating).toFixed(1) : '—'} · {detail.warnings.length} earlier warning{detail.warnings.length === 1 ? '' : 's'}
            </p>
            {detail.reviews.length > 1 && <ReviewList reviews={detail.reviews} />}
          </>
        )}
        <SelectField label="What should happen?" options={ACTIONS} value={action} onChange={(event) => setAction(event.target.value)} />
        {action === 'Deactivate' && <Alert type="warning">The employee is released from every organization and cannot sign in again until you activate them from the Employee Pool.</Alert>}
        <TextArea label="Your comment (the manager and the employee see it)" required rows={3} maxLength={500} value={response} onChange={(event) => setResponse(event.target.value)} error={problem} />
      </form>
    </Modal>
  )
}

/** Admin: serious reviews that organization managers sent to the admin. Decide: warn, deactivate, or no action. */
function ReviewRequestsPage() {
  const [filter, setFilter] = useState('Pending')
  const [deciding, setDeciding] = useState(null)
  const [notice, setNotice] = useFlashNotice()
  const { data, error, loading, reload } = useFetch((signal) => reviewEscalationsApi.list(filter, signal), `review-escalations-${filter}`)
  const items = data ?? []

  return (
    <div className="page">
      <PageHeader title="Review Requests" description="Bad reviews that an organization manager could not settle alone. Warn the employee, deactivate them, or take no action. Your comment goes back to the manager." />
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card">
        <div className="toolbar">
          <SelectField
            className="toolbar__filter"
            label="Show"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            options={[
              { value: 'Pending', label: 'Waiting for my decision' },
              { value: 'Decided', label: 'Decided' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading..." />
        ) : items.length === 0 ? (
          <EmptyState icon="inbox" title="Nothing here" text="No review request in this list." />
        ) : (
          <div className="table-wrap" aria-busy={loading}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Organization</th>
                  <th>Review</th>
                  <th>Manager&apos;s message</th>
                  <th>Status</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.escalationId}>
                    <td>
                      <strong>{item.employeeName}</strong>
                      {!item.employeeActive && <span className="person__sub">Deactivated</span>}
                    </td>
                    <td>{item.organizationName}</td>
                    <td style={{ maxWidth: '18rem' }}>
                      <Stars value={item.rating} />
                      <span className="person__sub">{item.comment}</span>
                    </td>
                    <td style={{ maxWidth: '18rem' }}>
                      {item.managerNote}
                      <span className="person__sub">{formatDateTime(item.createdAt)}</span>
                    </td>
                    <td>
                      {item.status === 'Pending' ? (
                        <Badge tone="warning">Waiting</Badge>
                      ) : (
                        <>
                          <Badge tone={item.adminAction === 'Deactivate' ? 'danger' : 'success'}>{item.adminAction}</Badge>
                          <span className="person__sub">{item.decidedAt ? formatDate(item.decidedAt) : ''}</span>
                        </>
                      )}
                    </td>
                    <td>{item.status === 'Pending' && <Button onClick={() => setDeciding(item)}>Decide</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {deciding && (
        <DecideModal
          item={deciding}
          onClose={() => setDeciding(null)}
          onDone={(message) => {
            setDeciding(null)
            setNotice(message)
            reload()
          }}
        />
      )}
    </div>
  )
}

export default ReviewRequestsPage
