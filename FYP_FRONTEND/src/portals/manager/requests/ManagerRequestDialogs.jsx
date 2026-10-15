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
import { managerAllocationsApi, managerRequestsApi } from '../../../services/manager/managerService.js'
import { onlyErrors, validateChoice, validateInteger, validateText } from '../../../utils/validators.js'
import RequestStaffPicker from './RequestStaffPicker.jsx'

/** "2026-10-14T10:00" (local time from the input) -> ISO string in UTC for the API. */
const toIso = (value) => (value ? new Date(value).toISOString() : undefined)

function validateRequest(form) {
  const start = form.startDatetime ? new Date(form.startDatetime) : null
  const end = form.endDatetime ? new Date(form.endDatetime) : null
  return onlyErrors({
    organizationId: form.organizationId ? '' : 'Select the organization.',
    requiredEmployees: validateInteger(form.requiredEmployees, { label: 'Employees needed', min: 1, max: 100 }),
    priority: validateChoice(form.priority, TICKET_PRIORITY_OPTIONS, 'Priority'),
    startDatetime: !start || Number.isNaN(start.getTime()) ? 'Choose when the staff are needed from.' : '',
    endDatetime: !end || Number.isNaN(end.getTime()) ? 'Choose when the staff are needed until.' : end <= new Date() ? 'The end must be in the future.' : start && end <= start ? 'The end must be after the start.' : '',
    reason: validateText(form.reason, { label: 'The reason', min: 5, max: 255 }),
  })
}

/** Log a staff request for one of the manager's organizations (for example one more employee for a specific time). The admin decides on it. */
export function NewRequestModal({ organizations, onClose, onDone }) {
  const { form, field, checkAll, addServerErrors } = useFormFields(
    {
      organizationId: organizations.length === 1 ? String(organizations[0].organizationId) : '',
      requiredEmployees: '1',
      skillId: '',
      priority: 'Medium',
      startDatetime: '',
      endDatetime: '',
      reason: '',
    },
    validateRequest,
  )
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { data: skills } = useFetch((signal) => managerAllocationsApi.skills(signal), 'manager-skills')

  const organizationOptions = organizations.filter((org) => org.status === 'Active' || org.status === 'Approved').map((org) => ({ value: String(org.organizationId), label: org.name }))
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
      const result = await managerRequestsApi.create({
        organizationId: Number(form.organizationId),
        requiredEmployees: Number(form.requiredEmployees),
        skillId: form.skillId ? Number(form.skillId) : undefined,
        priority: form.priority,
        startDatetime: toIso(form.startDatetime),
        endDatetime: toIso(form.endDatetime),
        reason: form.reason.trim(),
      })
      onDone(result?.message || 'Staff request logged.')
    } catch (problem) {
      addServerErrors(problem.fieldErrors)
      setServerError(problem.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="New staff request"
      subtitle="For example one more employee for a specific time. The admin decides on it; once approved you can staff it from the employee pool."
      size="lg"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="manager-request-form" loading={submitting}>
            Log request
          </Button>
        </>
      }
    >
      <form id="manager-request-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <div className="form-grid">
          <SelectField label="Organization" required options={organizationOptions} placeholder="Select an organization" {...field('organizationId')} />
          <TextField label="Employees needed" required type="number" min="1" max="100" {...field('requiredEmployees')} />
          <SelectField label="Skill (optional)" options={skillOptions} placeholder="Any skill" {...field('skillId')} />
          <SelectField label="Priority" required options={TICKET_PRIORITY_OPTIONS} {...field('priority')} />
          <TextField label="Needed from" required type="datetime-local" {...field('startDatetime')} />
          <TextField label="Needed until" required type="datetime-local" {...field('endDatetime')} />
        </div>
        <TextArea label="Reason" required rows={3} maxLength={255} placeholder="Why are more employees needed?" {...field('reason')} />
      </form>
    </Modal>
  )
}

/** The "Allocate" button of the request list: the free employees of the pool, tick the ones to send to the organization. */
export function AllocateToRequestModal({ request, onClose, onDone }) {
  const picker = {
    requestId: request.requestId,
    stillNeeded: Math.max(0, (request.requiredEmployees ?? 0) - request.staffedNow),
    skillName: request.skillName,
    willApprove: request.status === 'Pending',
  }

  return (
    <Modal
      title={`Allocate employees to ${request.orgName}`}
      subtitle={`${request.reason} · ${picker.stillNeeded} more needed`}
      size="lg"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <RequestStaffPicker request={picker} onStaffed={onDone} />
    </Modal>
  )
}
