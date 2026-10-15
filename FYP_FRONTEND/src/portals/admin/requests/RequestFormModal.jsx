import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { TICKET_PRIORITY_OPTIONS } from '../../../constants/support.js'
import { workforceRequestsApi } from '../../../services/admin/adminService.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { onlyErrors, validateChoice, validateDate, validateDateOrder, validateInteger, validateText } from '../../../utils/validators.js'

/** "2026-10-14T10:00" (local time from the input) -> ISO string in UTC for the API. */
function toIso(value) {
  return value ? new Date(value).toISOString() : undefined
}

function validateRequest(form) {
  const errors = {
    organizationId: form.organizationId ? '' : 'Select an organization.',
    requiredEmployees: validateInteger(form.requiredEmployees, { label: 'Employees needed', min: 1, max: 1000 }),
    priority: validateChoice(form.priority, TICKET_PRIORITY_OPTIONS, 'Priority'),
    start: validateDate(form.start, { label: 'Needed from' }),
    end: validateDate(form.end, { label: 'Needed until', notInPast: true }),
    reason: validateText(form.reason, { label: 'The reason', min: 5, max: 255 }),
  }
  if (!errors.end) errors.end = validateDateOrder(form.start, form.end, { endLabel: 'Needed until', startLabel: 'the start' })
  return onlyErrors(errors)
}

/** Log a request for staff on behalf of an organization (the organization portal will send these itself later). */
function RequestFormModal({ organizations, skills, onClose, onCreated }) {
  const { form, field, checkAll, addServerErrors } = useFormFields(
    { organizationId: '', requiredEmployees: '', skillId: '', priority: 'Medium', start: '', end: '', reason: '' },
    validateRequest,
  )
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const organizationOptions = organizations
    .filter((org) => org.status === 'Active' || org.status === 'Approved')
    .map((org) => ({ value: String(org.organizationId), label: org.name }))
  const skillOptions = skills.map((skill) => ({ value: String(skill.skillId), label: skill.name }))

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }

    setSubmitting(true)
    setServerError('')
    try {
      const result = await workforceRequestsApi.create({
        organizationId: Number(form.organizationId),
        requiredEmployees: Number(form.requiredEmployees),
        skillId: form.skillId ? Number(form.skillId) : undefined,
        priority: form.priority,
        startDatetime: toIso(form.start),
        endDatetime: toIso(form.end),
        reason: form.reason.trim(),
      })
      onCreated(result)
    } catch (error) {
      addServerErrors({ ...error.fieldErrors, start: error.fieldErrors?.startDatetime, end: error.fieldErrors?.endDatetime })
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="New staff request"
      subtitle="Record a request for employees. It waits for your decision before anyone is allocated."
      size="lg"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="request-form" loading={submitting}>
            Log request
          </Button>
        </>
      }
    >
      <form id="request-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <div className="form-grid">
          <SelectField
            label="Organization" required
            {...field('organizationId')}
            options={organizationOptions}
            placeholder="Select an organization"
            hint="Only approved organizations with an active contract."
          />
          <TextField label="Employees needed" type="number" inputMode="numeric" required min="1" max="1000" step="1" {...field('requiredEmployees')} />
          <SelectField label="Skill needed (optional)" {...field('skillId')} options={skillOptions} placeholder="Any skill" />
          <SelectField label="Priority" required {...field('priority')} options={TICKET_PRIORITY_OPTIONS} />
          <TextField label="Needed from" required type="datetime-local" {...field('start')}  />
          <TextField label="Needed until" required type="datetime-local" {...field('end')}  />
        </div>
        <TextArea label="Reason" required rows={3} {...field('reason')} maxLength={255} />
      </form>
    </Modal>
  )
}

export default RequestFormModal
