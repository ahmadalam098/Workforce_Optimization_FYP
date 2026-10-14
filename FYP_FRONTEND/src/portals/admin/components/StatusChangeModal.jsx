import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { AVAILABILITY_OPTIONS } from '../../../constants/employee.js'
import { employeesApi } from '../../../services/adminService.js'
import { onLeave } from '../../../utils/onLeave.js'
import { validateChoice, validateText } from '../../../utils/validators.js'

/** Change the availability status of one employee; the change and reason go into the status history. */
function StatusChangeModal({ employee, onClose, onSaved }) {
  const [status, setStatus] = useState(employee.availabilityStatus || 'Available')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const unchanged = status === employee.availabilityStatus

  async function handleSubmit(event) {
    event.preventDefault()
    const next = {}
    const statusError = validateChoice(status, AVAILABILITY_OPTIONS, 'Availability')
    const reasonError = validateText(reason, { label: 'The reason', required: false, min: 3, max: 255 })
    if (statusError) next.status = statusError
    if (reasonError) next.reason = reasonError
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    setServerError('')
    try {
      await employeesApi.update(employee.employeeId, { availabilityStatus: status, statusReason: reason.trim() || 'Changed by admin' })
      onSaved(`${employee.fullName} is now ${status}.`)
    } catch (error) {
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Change status"
      subtitle={employee.fullName}
      size="sm"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="status-form" loading={submitting} disabled={unchanged}>
            Save status
          </Button>
        </>
      }
    >
      <form id="status-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <SelectField label="Availability" required value={status} onChange={(event) => { setStatus(event.target.value); setErrors((current) => ({ ...current, status: '' })) }} options={AVAILABILITY_OPTIONS} error={errors.status} />
        <TextField label="Reason (optional)" value={reason} onChange={(event) => { setReason(event.target.value); setErrors((current) => ({ ...current, reason: '' })) }} onBlur={onLeave(() => setErrors((current) => ({ ...current, reason: validateText(reason, { label: 'The reason', required: false, min: 3, max: 255 }) })))} error={errors.reason} maxLength={255} autoComplete="off" />
      </form>
    </Modal>
  )
}

export default StatusChangeModal
