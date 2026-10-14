import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { shiftsApi } from '../../../services/adminService.js'
import { toApiTime, toTimeInput } from '../../../utils/contractFormat.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { onlyErrors, validateText, validateTime } from '../../../utils/validators.js'

function validateShift(form) {
  const errors = {
    name: validateText(form.name, {
      label: 'Shift name',
      min: 2,
      max: 50,
      pattern: /^[\p{L}\p{N}][\p{L}\p{N}\s&()/.-]*$/u,
      patternMessage: 'Shift name can only contain letters, numbers, spaces and & ( ) / . -',
    }),
    startTime: validateTime(form.startTime, { label: 'Start time' }),
    endTime: validateTime(form.endTime, { label: 'End time' }),
  }
  if (!errors.startTime && !errors.endTime && form.startTime === form.endTime) errors.endTime = 'End time must be different from the start time.'
  return onlyErrors(errors)
}

/** Create (no `shift`) or edit a shift. A shift whose end is earlier than its start runs overnight. */
function ShiftFormModal({ shift, onClose, onSaved }) {
  const isEdit = Boolean(shift)
  const { form, field, checkAll, addServerErrors } = useFormFields(
    { name: shift?.name ?? '', startTime: toTimeInput(shift?.startTime), endTime: toTimeInput(shift?.endTime) },
    validateShift,
  )
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }

    const payload = { name: form.name.trim(), startTime: toApiTime(form.startTime), endTime: toApiTime(form.endTime) }

    setSubmitting(true)
    setServerError('')
    try {
      if (isEdit) {
        await shiftsApi.update(shift.shiftId, payload)
        onSaved('Shift updated.')
      } else {
        await shiftsApi.create(payload)
        onSaved('Shift created.')
      }
    } catch (error) {
      addServerErrors(error.fieldErrors)
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  const overnight = form.startTime && form.endTime && form.endTime < form.startTime

  return (
    <Modal
      title={isEdit ? 'Edit shift' : 'Add shift'}
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="shift-form" loading={submitting}>
            {isEdit ? 'Save changes' : 'Create shift'}
          </Button>
        </>
      }
    >
      <form id="shift-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <TextField label="Shift name" required maxLength={50} {...field('name')} placeholder="e.g. Morning" autoComplete="off" />
        <div className="form-grid">
          <TextField label="Start time" required type="time" {...field('startTime')} />
          <TextField label="End time" required type="time" {...field('endTime')} />
        </div>
        {overnight && <Alert type="info">This shift runs overnight and ends the next day.</Alert>}
      </form>
    </Modal>
  )
}

export default ShiftFormModal
