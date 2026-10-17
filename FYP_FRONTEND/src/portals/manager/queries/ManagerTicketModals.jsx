import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Checkbox from '../../../components/ui/Checkbox.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { TICKET_PRIORITY_OPTIONS, TICKET_TYPE_OPTIONS } from '../../../constants/support.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { managerTicketsApi } from '../../../services/manager/managerService.js'
import { onlyErrors, validateChoice, validateText } from '../../../utils/validators.js'
import DecisionModal from '../../admin/shared/DecisionModal.jsx'

/** Answer an employee's query (not a severe one) and close it. The employee is emailed the answer. */
export function ResolveEmployeeQueryModal({ ticket, onClose, onDone }) {
  return (
    <DecisionModal
      title="Answer the employee"
      description={`${ticket.ticketNumber} · ${ticket.subject}${ticket.raisedBy ? ` · from ${ticket.raisedBy}` : ''}. The query is closed and the employee receives your answer by email.`}
      label="Your answer"
      required
      confirmLabel="Resolve"
      onSubmit={async (answer) => {
        const result = await managerTicketsApi.resolve(ticket.ticketId, answer)
        onDone(result?.message || 'Query resolved.')
      }}
      onClose={onClose}
    />
  )
}

/** Send a query or complaint to the admin, with an optional note and the severity the manager judges it to have. */
export function SendToAdminModal({ ticket, onClose, onDone }) {
  const [note, setNote] = useState('')
  const [priority, setPriority] = useState(ticket.priority || 'Medium')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (note.trim().length > 500) {
      setError('The note can have at most 500 characters.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await managerTicketsApi.forward(ticket.ticketId, note.trim() || undefined, priority)
      onDone(result?.message || 'Sent to the admin.')
    } catch (problem) {
      setError(problem.message)
      setSubmitting(false)
    }
  }

  const kind = ticket.source === 'Employee' ? 'query of the employee' : ticket.category.toLowerCase()

  return (
    <Modal
      title="Send to admin"
      subtitle={`${ticket.ticketNumber} · ${ticket.subject}`}
      size="md"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="send-to-admin-form" loading={submitting}>
            Send to admin
          </Button>
        </>
      }
    >
      <form id="send-to-admin-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {error && <Alert type="error">{error}</Alert>}
        <p className="cell-muted">The admin will see this {kind} marked as sent by you and is notified.</p>
        <SelectField
          label="Severity"
          options={TICKET_PRIORITY_OPTIONS}
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
          hint="High and Critical are severe: only the admin resolves those."
        />
        <TextArea label="Note for the admin (optional)" rows={3} maxLength={500} placeholder="Anything the admin should know or do" value={note} onChange={(event) => setNote(event.target.value)} />
      </form>
    </Modal>
  )
}

function validateTicket(form) {
  return onlyErrors({
    organizationId: form.organizationId ? '' : 'Select the organization.',
    category: validateChoice(form.category, TICKET_TYPE_OPTIONS, 'Type'),
    subject: validateText(form.subject, { label: 'Subject', min: 5, max: 150 }),
    description: validateText(form.description, { label: 'Description', min: 10, max: 2000 }),
    priority: validateChoice(form.priority, TICKET_PRIORITY_OPTIONS, 'Priority'),
    note: validateText(form.note, { label: 'The note', required: false, min: 3, max: 500 }),
  })
}

/** Log a query or complaint that one of the manager's organizations told them about. (Employees send their own from the Employee portal.) */
export function LogTicketModal({ organizations, onClose, onDone }) {
  const { form, field, setValue, checkAll, addServerErrors } = useFormFields(
    {
      organizationId: organizations.length === 1 ? String(organizations[0].organizationId) : '',
      category: 'Query',
      subject: '',
      description: '',
      priority: 'Medium',
      sendToAdmin: false,
      note: '',
    },
    validateTicket,
  )
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const organizationOptions = organizations.map((org) => ({ value: String(org.organizationId), label: org.name }))

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }
    setSubmitting(true)
    setServerError('')
    try {
      const result = await managerTicketsApi.create({
        organizationId: Number(form.organizationId),
        category: form.category,
        subject: form.subject.trim(),
        description: form.description.trim(),
        priority: form.priority,
        sendToAdmin: form.sendToAdmin,
        note: form.sendToAdmin && form.note.trim() ? form.note.trim() : undefined,
      })
      onDone(result?.message || 'Added.')
    } catch (problem) {
      addServerErrors(problem.fieldErrors)
      setServerError(problem.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Log a query or complaint"
      subtitle="Write down what an organization told you, so it can be handled."
      size="lg"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="log-ticket-form" loading={submitting}>
            {form.sendToAdmin ? 'Add and send to admin' : 'Add'}
          </Button>
        </>
      }
    >
      <form id="log-ticket-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <SelectField label="Organization" required options={organizationOptions} placeholder="Select an organization" {...field('organizationId')} />
        <div className="form-grid">
          <SelectField label="Type" required options={TICKET_TYPE_OPTIONS} {...field('category')} />
          <SelectField label="Severity" required options={TICKET_PRIORITY_OPTIONS} hint="High and Critical are severe: send those to the admin." {...field('priority')} />
        </div>
        <TextField label="Subject" required maxLength={150} autoComplete="off" {...field('subject')} />
        <TextArea label="Description" required rows={4} maxLength={2000} {...field('description')} />
        <Checkbox label="Send it to the admin right away" checked={form.sendToAdmin} onChange={(checked) => setValue('sendToAdmin', checked)} />
        {form.sendToAdmin && <TextArea label="Note for the admin (optional)" rows={2} maxLength={500} {...field('note')} />}
      </form>
    </Modal>
  )
}
