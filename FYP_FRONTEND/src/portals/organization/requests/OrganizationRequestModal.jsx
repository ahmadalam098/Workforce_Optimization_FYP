import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { TICKET_PRIORITY_OPTIONS } from '../../../constants/support.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { organizationRequestsApi } from '../../../services/organization/organizationService.js'
import { onlyErrors, validateChoice, validateInteger, validateText } from '../../../utils/validators.js'

/** "2026-10-14T10:00" (local time from the input) -> ISO string in UTC for the API. */
const toIso = (value) => (value ? new Date(value).toISOString() : undefined)

function validateRequest(form) {
  const start = form.startDatetime ? new Date(form.startDatetime) : null
  const end = form.endDatetime ? new Date(form.endDatetime) : null
  return onlyErrors({
    requiredEmployees: validateInteger(form.requiredEmployees, { label: 'Extra employees', min: 1, max: 100 }),
    priority: validateChoice(form.priority, TICKET_PRIORITY_OPTIONS, 'Priority'),
    startDatetime: !start || Number.isNaN(start.getTime()) ? 'Choose when you need them from.' : '',
    endDatetime: !end || Number.isNaN(end.getTime()) ? 'Choose when you need them until.' : end <= new Date() ? 'The end must be in the future.' : start && end <= start ? 'The end must be after the start.' : '',
    reason: validateText(form.reason, { label: 'The reason', min: 5, max: 255 }),
  })
}

/** Organization: ask for extra employees on top of the contract's minimum. The request goes to the organization manager. */
function OrganizationRequestModal({ onClose, onDone }) {
  const { form, field, checkAll, addServerErrors } = useFormFields(
    { requiredEmployees: '1', skillId: '', priority: 'Medium', startDatetime: '', endDatetime: '', reason: '' },
    validateRequest,
  )
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { data: skills } = useFetch((signal) => organizationRequestsApi.skills(signal), 'organization-skills')
  const skillOptions = (skills ?? []).map((skill) => ({ value: String(skill.skillId), label: skill.name }))

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }
    setSubmitting(true)
    setServerError('')
    try {
      const result = await organizationRequestsApi.create({
        requiredEmployees: Number(form.requiredEmployees),
        skillId: form.skillId ? Number(form.skillId) : undefined,
        priority: form.priority,
        startDatetime: toIso(form.startDatetime),
        endDatetime: toIso(form.endDatetime),
        reason: form.reason.trim(),
      })
      onDone(result?.message || 'Request sent.')
    } catch (problem) {
      addServerErrors(problem.fieldErrors)
      setServerError(problem.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Ask for extra employees"
      subtitle="These come on top of the minimum employees of your contract. Your organization manager decides and chooses the employees."
      size="lg"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="organization-request-form" loading={submitting}>
            Send request
          </Button>
        </>
      }
    >
      <form id="organization-request-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <div className="form-grid">
          <TextField label="Extra employees needed" required type="number" min="1" max="100" {...field('requiredEmployees')} />
          <SelectField label="Skill (optional)" options={skillOptions} placeholder="Any skill" {...field('skillId')} />
          <SelectField label="Priority" required options={TICKET_PRIORITY_OPTIONS} {...field('priority')} />
          <span />
          <TextField label="Needed from" required type="datetime-local" {...field('startDatetime')} />
          <TextField label="Needed until" required type="datetime-local" {...field('endDatetime')} />
        </div>
        <TextArea label="Reason" required rows={3} maxLength={255} placeholder="Why do you need more employees?" {...field('reason')} />
      </form>
    </Modal>
  )
}

export default OrganizationRequestModal
