import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { TICKET_TYPE_OPTIONS } from '../../../constants/support.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { employeeTicketsApi } from '../../../services/employee/employeeService.js'
import { formatDateTime, formatTimeAgo } from '../../../utils/format.js'
import { onlyErrors, validateChoice, validateText } from '../../../utils/validators.js'
import { PriorityBadge } from '../../admin/queries/TicketBadges.jsx'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import ViewButton from '../../admin/shared/ViewButton.jsx'

const PRIORITY_OPTIONS = [
  { value: 'Low', label: 'Low' },
  { value: 'Medium', label: 'Medium' },
  { value: 'High', label: 'High - urgent' },
]

const STATUS_FILTERS = [
  { value: 'Open', label: 'Not answered yet' },
  { value: 'Resolved', label: 'Answered' },
]

const STAGE_TONES = { 'With your manager': 'warning', 'With the admin': 'gold', Resolved: 'success' }

export function StageBadge({ stage }) {
  return <Badge tone={STAGE_TONES[stage] || 'neutral'}>{stage}</Badge>
}

function validateQuery(form) {
  return onlyErrors({
    category: validateChoice(form.category, TICKET_TYPE_OPTIONS, 'Type'),
    priority: validateChoice(form.priority, PRIORITY_OPTIONS, 'Urgency'),
    subject: validateText(form.subject, { label: 'Subject', min: 5, max: 150 }),
    description: validateText(form.description, { label: 'Description', min: 10, max: 2000 }),
  })
}

/** Write a query or complaint for the manager of the organization the employee works for. */
function NewQueryModal({ onClose, onDone }) {
  const { form, field, checkAll, addServerErrors } = useFormFields({ category: 'Query', priority: 'Medium', subject: '', description: '' }, validateQuery)
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }
    setSubmitting(true)
    setServerError('')
    try {
      const result = await employeeTicketsApi.create({
        category: form.category,
        priority: form.priority,
        subject: form.subject.trim(),
        description: form.description.trim(),
      })
      onDone(result?.message || 'Sent to your manager.')
    } catch (problem) {
      addServerErrors(problem.fieldErrors)
      setServerError(problem.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="New query or complaint"
      subtitle="It goes to the manager of the organization you work for, who answers it or passes it to the admin."
      size="lg"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="employee-query-form" loading={submitting}>
            Send
          </Button>
        </>
      }
    >
      <form id="employee-query-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <div className="form-grid">
          <SelectField label="Type" required options={TICKET_TYPE_OPTIONS} {...field('category')} />
          <SelectField label="Urgency" required options={PRIORITY_OPTIONS} hint="Use High only when it cannot wait." {...field('priority')} />
        </div>
        <TextField label="Subject" required maxLength={150} autoComplete="off" {...field('subject')} />
        <TextArea label="Describe it" required rows={5} maxLength={2000} {...field('description')} />
      </form>
    </Modal>
  )
}

/** Employee: the queries and complaints I sent, and whether they were answered. */
function EmployeeQueriesPage() {
  const [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useFlashNotice()
  const { data, error, loading, reload } = useFetch((signal) => employeeTicketsApi.list(status, signal), `employee-tickets-${status}`)
  const items = data ?? []

  return (
    <div className="page">
      <PageHeader
        title="My Queries"
        description="Ask your manager a question or tell them about a problem. You will see the answer here and receive it by email."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Icon name="plus" size={18} /> New query
          </Button>
        }
      />
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card">
        <div className="toolbar">
          <SelectField className="toolbar__filter" label="Show" value={status} onChange={(event) => setStatus(event.target.value)} options={STATUS_FILTERS} placeholder="All" />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading your queries..." />
        ) : items.length === 0 ? (
          <EmptyState icon="inbox" title="Nothing here" text={status ? 'No query matches this filter.' : 'You have not sent any query or complaint yet.'} />
        ) : (
          <div className="table-wrap" aria-busy={loading}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Subject</th>
                  <th>Type</th>
                  <th>Urgency</th>
                  <th>Where it is</th>
                  <th>Sent</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ticket) => (
                  <tr key={ticket.ticketId}>
                    <td className="cell-muted">{ticket.ticketNumber}</td>
                    <td>
                      <strong>{ticket.subject}</strong>
                    </td>
                    <td>{ticket.category}</td>
                    <td>
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td>
                      <StageBadge stage={ticket.stage} />
                    </td>
                    <td className="cell-muted" title={formatDateTime(ticket.createdAt)}>
                      {formatTimeAgo(ticket.createdAt)}
                    </td>
                    <td>
                      <ViewButton to={`/employee/queries/${ticket.ticketId}`} label={`View ${ticket.ticketNumber}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating && (
        <NewQueryModal
          onClose={() => setCreating(false)}
          onDone={(message) => {
            setCreating(false)
            setNotice(message)
            reload()
          }}
        />
      )}
    </div>
  )
}

export default EmployeeQueriesPage
