import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { managerAllocationsApi } from '../../../services/manager/managerService.js'
import { onLeave } from '../../../utils/onLeave.js'
import { validateText } from '../../../utils/validators.js'

/** "2026-10-14T10:00" (local time from the input) -> ISO string in UTC for the API. */
function toIso(value) {
  return value ? new Date(value).toISOString() : undefined
}

const TEXT = {
  assign: { title: 'Assign employee', submit: 'Assign', reasonHint: 'Why is this employee needed here?' },
  move: { title: 'Move employee', submit: 'Move', reasonHint: 'Why is the employee being moved?' },
  release: { title: 'Remove employee', submit: 'Remove', reasonHint: 'Why is the employee being removed?' },
}

/**
 * The three manual allocation actions of an Organization Manager.
 * mode 'assign': put a free employee in one of the manager's organizations.
 * mode 'move': move an employee between the manager's organizations.
 * mode 'release': remove the employee from the organization (they become available in the pool again).
 * Contract rules are checked by the server; a manager cannot override a broken rule.
 */
function ManagerAllocationModal({ mode, employee, organizations, onClose, onDone }) {
  const text = TEXT[mode]
  const needsOrganization = mode !== 'release'

  const organizationOptions = organizations
    .filter((org) => (org.status === 'Active' || org.status === 'Approved') && org.organizationId !== employee.workingOrgId)
    .map((org) => ({ value: String(org.organizationId), label: org.name }))

  const [organizationId, setOrganizationId] = useState('')
  const [expectedEnd, setExpectedEnd] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [violations, setViolations] = useState([])
  const [submitting, setSubmitting] = useState(false)

  function check() {
    const next = {}
    if (needsOrganization && !organizationId) next.organizationId = 'Select an organization.'
    const reasonError = validateText(reason, { label: 'The reason', min: 3, max: 200 })
    if (reasonError) next.reason = reasonError
    if (needsOrganization && expectedEnd) {
      if (Number.isNaN(new Date(expectedEnd).getTime())) next.expectedEnd = 'The expected end is not a valid date.'
      else if (new Date(expectedEnd) <= new Date()) next.expectedEnd = 'The expected end must be in the future.'
    }
    return next
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const found = check()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSubmitting(true)
    setServerError('')
    setViolations([])
    try {
      let result
      if (mode === 'assign') {
        result = await managerAllocationsApi.assign({
          employeeId: employee.employeeId,
          organizationId: Number(organizationId),
          expectedEnd: toIso(expectedEnd),
          reason: reason.trim(),
        })
      } else if (mode === 'move') {
        result = await managerAllocationsApi.move(employee.allocationId, {
          organizationId: Number(organizationId),
          expectedEnd: toIso(expectedEnd),
          reason: reason.trim(),
        })
      } else {
        result = await managerAllocationsApi.release(employee.allocationId, { reason: reason.trim() })
      }
      onDone(result?.message || 'Done.')
    } catch (error) {
      setErrors((current) => ({ ...current, ...error.fieldErrors }))
      setServerError(error.message)
      if (Array.isArray(error.data?.violations)) setViolations(error.data.violations)
      setSubmitting(false)
    }
  }

  const subtitle =
    mode === 'assign'
      ? `${employee.fullName} is free in the pool. Choose which of your organizations they join.`
      : mode === 'move'
        ? `${employee.fullName} works for ${employee.workingOrgName}. Choose another of your organizations.`
        : `${employee.fullName} will leave ${employee.workingOrgName} and be available in the pool again.`

  return (
    <Modal
      title={text.title}
      subtitle={subtitle}
      size="md"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="manager-allocation-form" loading={submitting} className={mode === 'release' ? 'btn--danger' : ''}>
            {text.submit}
          </Button>
        </>
      }
    >
      <form id="manager-allocation-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && (
          <Alert type="error">
            {serverError}
            {violations.length > 1 && (
              <ul>
                {violations.map((violation) => (
                  <li key={violation.code}>{violation.message}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}

        {needsOrganization && (
          <>
            <SelectField
              label="Organization"
              required
              options={organizationOptions}
              placeholder="Select an organization"
              hint={organizationOptions.length === 0 ? 'None of your organizations is active, so nobody can be assigned yet.' : undefined}
              value={organizationId}
              onChange={(event) => {
                setOrganizationId(event.target.value)
                setErrors((current) => ({ ...current, organizationId: '' }))
              }}
              error={errors.organizationId}
            />
            <TextField
              label="Expected end (optional)"
              type="datetime-local"
              value={expectedEnd}
              onChange={(event) => setExpectedEnd(event.target.value)}
              hint="Leave empty if there is no planned end."
              error={errors.expectedEnd}
            />
          </>
        )}

        <TextArea
          label="Reason"
          required
          rows={3}
          maxLength={200}
          placeholder={text.reasonHint}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            setErrors((current) => ({ ...current, reason: '' }))
          }}
          onBlur={onLeave(() => setErrors((current) => ({ ...current, reason: validateText(reason, { label: 'The reason', min: 3, max: 200 }) })))}
          error={errors.reason}
        />
      </form>
    </Modal>
  )
}

export default ManagerAllocationModal
