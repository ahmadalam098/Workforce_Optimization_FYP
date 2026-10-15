import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { employeeExtrasApi } from '../../../services/admin/adminService.js'
import { formatTimeRange } from '../../../utils/contractFormat.js'

/** Move one employee to another shift, or remove them from their shift. `shifts` is the shift list. */
function ChangeShiftModal({ employee, shifts, onClose, onSaved }) {
  const [shiftId, setShiftId] = useState(employee.currentShift ? String(employee.currentShift.shiftId) : '')
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const options = shifts.map((shift) => ({
    value: String(shift.shiftId),
    label: `${shift.name} (${formatTimeRange(shift.startTime, shift.endTime)})`,
  }))

  async function handleSubmit(event) {
    event.preventDefault()
    if (shiftId && !options.some((option) => option.value === String(shiftId))) {
      setServerError('Choose one of the shifts in the list.')
      return
    }
    setSubmitting(true)
    setServerError('')
    try {
      const result = await employeeExtrasApi.setShift(employee.employeeId, shiftId ? Number(shiftId) : null)
      onSaved(result?.message || 'Shift updated.')
    } catch (error) {
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Change shift"
      subtitle={`Working shift for ${employee.fullName}. The previous assignment stays in the history.`}
      size="sm"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="change-shift-form" loading={submitting}>
            Save shift
          </Button>
        </>
      }
    >
      <form id="change-shift-form" onSubmit={handleSubmit} className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <SelectField
          label="Shift"
          value={shiftId}
          onChange={(event) => {
            setShiftId(event.target.value)
            setServerError('')
          }}
          options={options}
          placeholder="No shift"
          hint={shifts.length === 0 ? 'No shifts exist yet. Create one on the Shifts page.' : undefined}
        />
      </form>
    </Modal>
  )
}

export default ChangeShiftModal
