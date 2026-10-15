import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { allocationsApi } from '../../../services/admin/adminService.js'
import { humanize, toLocalInputValue } from '../../../utils/format.js'
import { validateText } from '../../../utils/validators.js'
import ViolationPanel from './ViolationPanel.jsx'
import './AssignEmployeesModal.css'

/** "2026-10-14T10:00" (local time from the input) -> ISO string in UTC for the API. */
function toIso(value) {
  return value ? new Date(value).toISOString() : undefined
}

/**
 * Manual allocation (the admin overriding or replacing the AI).
 * mode 'allocate': pick an employee and an organization.
 * mode 'reallocate': move `allocation` to another organization.
 * When the API reports broken contract rules, they are listed and the admin may override them on purpose.
 */
function AllocateModal({ mode = 'allocate', allocation, organizations, staffRequest, presetEmployee, onClose, onDone }) {
  const isReallocate = mode === 'reallocate'

  const [search, setSearch] = useState('')
  const [employee, setEmployee] = useState(presetEmployee ?? null)
  const [organizationId, setOrganizationId] = useState(staffRequest ? String(staffRequest.orgId) : '')
  const [expectedEnd, setExpectedEnd] = useState(staffRequest ? toLocalInputValue(staffRequest.endDatetime) : '')
  const [reason, setReason] = useState(staffRequest ? `Staff request #${staffRequest.requestId}` : '')
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [violationInfo, setViolationInfo] = useState(null) // { violations, canOverride }
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const debouncedSearch = useDebouncedValue(search)
  const { data: candidates, loading } = useFetch(
    (signal) => (isReallocate ? Promise.resolve([]) : allocationsApi.eligibleEmployees(debouncedSearch.trim(), signal)),
    `eligible-${isReallocate}-${debouncedSearch.trim()}`,
  )

  const organizationOptions = organizations
    .filter((org) => (org.status === 'Active' || org.status === 'Approved') && (!isReallocate || org.organizationId !== allocation.assignOrgId))
    .map((org) => ({ value: String(org.organizationId), label: org.name }))

  // Any change invalidates a previous rule check.
  function touched() {
    setViolationInfo(null)
    setConfirmed(false)
    setServerError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!isReallocate && !employee) nextErrors.employeeId = 'Select an employee.'
    if (!organizationId) nextErrors.assignOrgId = 'Select an organization.'
    const reasonError = validateText(reason, { label: 'The reason', min: 3, max: 200 })
    if (reasonError) nextErrors.reason = reasonError
    if (expectedEnd && Number.isNaN(new Date(expectedEnd).getTime())) nextErrors.expectedEnd = 'The expected end is not a valid date.'
    else if (expectedEnd && new Date(expectedEnd) <= new Date()) nextErrors.expectedEnd = 'The expected end must be in the future.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const force = Boolean(violationInfo?.canOverride && confirmed)

    setSubmitting(true)
    setServerError('')
    try {
      const result = isReallocate
        ? await allocationsApi.reallocate(allocation.allocationId, {
            assignOrgId: Number(organizationId),
            expectedEnd: toIso(expectedEnd),
            reason: reason.trim(),
            force,
          })
        : await allocationsApi.allocate({
            employeeId: employee.employeeId,
            assignOrgId: Number(organizationId),
            expectedEnd: toIso(expectedEnd),
            workforceRequestId: staffRequest?.requestId,
            reason: reason.trim(),
            force,
          })
      onDone(result?.message || 'Done.')
    } catch (error) {
      setErrors((current) => ({ ...current, ...error.fieldErrors }))
      const violations = error.data?.violations
      if (Array.isArray(violations) && violations.length > 0) {
        setViolationInfo({ violations, canOverride: Boolean(error.data.canOverride) })
        setConfirmed(false)
      } else {
        setServerError(error.message)
      }
      setSubmitting(false)
    }
  }

  const needsConfirmation = Boolean(violationInfo) && (!violationInfo.canOverride || !confirmed)
  const submitLabel = violationInfo?.canOverride && confirmed ? 'Override and continue' : isReallocate ? 'Reallocate' : 'Allocate'

  return (
    <Modal
      title={isReallocate ? 'Reallocate employee' : 'New allocation'}
      subtitle={
        isReallocate
          ? `${allocation.employeeName} currently works for ${allocation.assignOrgName}.`
          : staffRequest
            ? `Staff ${staffRequest.orgName}'s request. Contract rules are checked first.`
            : 'Place an employee with an organization yourself. Contract rules are checked first.'
      }
      size="lg"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="allocate-form"
            loading={submitting}
            disabled={needsConfirmation}
            className={violationInfo?.canOverride && confirmed ? 'btn--danger' : ''}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id="allocate-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}

        {!isReallocate && (
          <div className="form-stack">
            <TextField
              label="Employee"
              icon="search"
              placeholder="Search active employees without an allocation"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              error={errors.employeeId}
              autoComplete="off"
            />
            {loading && !candidates ? (
              <Spinner label="Loading employees..." size={22} />
            ) : (candidates ?? []).length === 0 ? (
              <p className="cell-muted">No available employees found.</p>
            ) : (
              <ul className="assign-list" aria-label="Employees">
                {candidates.map((item) => {
                  const selected = employee?.employeeId === item.employeeId
                  return (
                    <li key={item.employeeId}>
                      <label className={`assign-list__item ${selected ? 'is-checked' : ''}`}>
                        <input
                          type="radio"
                          name="employee"
                          checked={selected}
                          onChange={() => {
                            setEmployee(item)
                            setErrors((current) => ({ ...current, employeeId: '' }))
                            touched()
                          }}
                        />
                        <span className="assign-list__text">
                          <strong>{item.fullName}</strong>
                          <span className="cell-muted">
                            {item.homeOrgName || 'Central pool'} · {humanize(item.availabilityStatus)}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        <div className="form-grid">
          <SelectField
            label={isReallocate ? 'Move to organization' : 'Assign to organization'}
            value={organizationId}
            onChange={(event) => {
              setOrganizationId(event.target.value)
              setErrors((current) => ({ ...current, assignOrgId: '' }))
              touched()
            }}
            options={organizationOptions}
            disabled={Boolean(staffRequest)}
            placeholder="Select an organization"
            error={errors.assignOrgId}
            hint={staffRequest ? 'Fixed by the staff request.' : 'Only approved organizations are listed.'}
          />
          <TextField
            label="Expected end (optional)"
            type="datetime-local"
            value={expectedEnd}
            onChange={(event) => {
              setExpectedEnd(event.target.value)
              setErrors((current) => ({ ...current, expectedEnd: '' }))
              touched()
            }}
            error={errors.expectedEnd}
          />
        </div>

        <TextArea
          label="Reason"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            setErrors((current) => ({ ...current, reason: '' }))
          }}
          error={errors.reason}
          maxLength={200}
        />

        {violationInfo && (
          <ViolationPanel
            violations={violationInfo.violations}
            canOverride={violationInfo.canOverride}
            confirmed={confirmed}
            onConfirmChange={setConfirmed}
          />
        )}
      </form>
    </Modal>
  )
}

export default AllocateModal
