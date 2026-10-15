import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { MONTH_OPTIONS } from '../../../constants/billing.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { overtimeApi, payrollApi } from '../../../services/admin/adminService.js'
import { formatCurrency } from '../../../utils/format.js'
import { onlyErrors, validateChoice, validateDate, validateNumber, validateText } from '../../../utils/validators.js'
import EmployeePicker from '../employees/EmployeePicker.jsx'

/** Generate the payroll of a month (defaults to last month). */
export function NewPayrollModal({ onClose, onCreated }) {
  const now = new Date()
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((value) => ({ value: String(value), label: String(value) }))

  const { form, field, checkAll, addServerErrors } = useFormFields(
    { year: String(previous.getFullYear()), month: String(previous.getMonth() + 1) },
    (values) => {
      const errors = {
        month: validateChoice(values.month, MONTH_OPTIONS, 'Month'),
        year: validateChoice(values.year, yearOptions, 'Year'),
      }
      // Pay is worked out after the month is over, so a month that has not started yet is refused.
      if (!errors.month && !errors.year && Number(values.year) * 12 + Number(values.month) > now.getFullYear() * 12 + now.getMonth() + 1) {
        errors.month = 'Payroll cannot be generated for a month that has not started yet.'
      }
      return onlyErrors(errors)
    },
  )

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) return
    setSubmitting(true)
    setServerError('')
    try {
      const result = await payrollApi.create({ year: Number(form.year), month: Number(form.month) })
      onCreated(result)
    } catch (error) {
      addServerErrors(error.fieldErrors)
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Generate payroll"
      subtitle="Uses each employee's salary and the overtime approved in that month."
      size="sm"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="new-payroll-form" loading={submitting}>
            Generate
          </Button>
        </>
      }
    >
      <form id="new-payroll-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <div className="form-grid">
          <SelectField label="Month" required options={MONTH_OPTIONS} {...field('month')} />
          <SelectField label="Year" required options={yearOptions} {...field('year')} />
        </div>
      </form>
    </Modal>
  )
}

/** Manual pay adjustment (bonus or deduction) for one employee in a draft payroll. */
export function PayrollItemModal({ payrollId, item, onClose, onSaved }) {
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { form, field, checkAll, addServerErrors } = useFormFields(
    { adjustment: String(item.adjustment), adjustmentNote: item.adjustmentNote ?? '' },
    (values) => {
      const errors = {
        adjustment: validateNumber(values.adjustment, { label: 'Adjustment', min: -10000000, max: 10000000, decimals: 2 }),
        adjustmentNote: validateText(values.adjustmentNote, { label: 'The reason', required: Number(values.adjustment) !== 0, min: 3, max: 255 }),
      }
      // A deduction cannot be bigger than what the employee earned that month.
      const earned = item.baseSalary + item.overtimeAmount
      if (!errors.adjustment && Number(values.adjustment) < 0 && -Number(values.adjustment) > earned) {
        errors.adjustment = `A deduction cannot be more than the pay before it (${formatCurrency(earned, item.currency)}).`
      }
      return onlyErrors(errors)
    },
  )

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) return

    setSubmitting(true)
    setServerError('')
    try {
      await payrollApi.updateItem(payrollId, item.itemId, { adjustment: Number(form.adjustment), adjustmentNote: form.adjustmentNote.trim() || undefined })
      onSaved(`Pay updated for ${item.employeeName}.`)
    } catch (error) {
      addServerErrors(error.fieldErrors)
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Adjust pay"
      subtitle={`${item.employeeName} · ${formatCurrency(item.baseSalary + item.overtimeAmount, item.currency)} before the adjustment`}
      size="sm"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="payroll-item-form" loading={submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="payroll-item-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <TextField
          label={`Adjustment (${item.currency})`}
          required
          type="number"
          inputMode="decimal"
          step="0.01"
          hint="Positive for a bonus, negative for a deduction."
          {...field('adjustment')}
        />
        <TextField label="Reason" maxLength={255} autoComplete="off" {...field('adjustmentNote')} />
      </form>
    </Modal>
  )
}

/** Record overtime worked by an employee. The rate comes from their salary structure. */
export function OvertimeFormModal({ onClose, onSaved }) {
  const [employee, setEmployee] = useState(null)
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const { form, errors, field, checkAll, addServerErrors, setErrors } = useFormFields({ workDate: today, totalHours: '' }, (values) =>
    onlyErrors({
      workDate: validateDate(values.workDate, { label: 'Date worked', notInFuture: true }),
      totalHours: validateNumber(values.totalHours, { label: 'Hours', min: 0.25, max: 24, decimals: 2 }),
    }),
  )

  async function handleSubmit(event) {
    event.preventDefault()
    const valid = checkAll()
    if (!employee) {
      setErrors((current) => ({ ...current, employeeId: 'Select an employee.' }))
      return
    }
    if (!valid) return

    setSubmitting(true)
    setServerError('')
    try {
      const result = await overtimeApi.create({ employeeId: employee.employeeId, workDate: form.workDate, totalHours: Number(form.totalHours) })
      onSaved(result?.message || 'Overtime recorded.')
    } catch (error) {
      addServerErrors(error.fieldErrors)
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Record overtime"
      subtitle="It is paid only after approval, in the payroll of the month it was worked."
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="overtime-form" loading={submitting}>
            Record overtime
          </Button>
        </>
      }
    >
      <form id="overtime-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <EmployeePicker
          selectedId={employee?.employeeId}
          onChange={(item) => {
            setEmployee(item)
            setErrors((current) => ({ ...current, employeeId: '' }))
          }}
          error={errors.employeeId}
        />
        <div className="form-grid">
          <TextField label="Date worked" required type="date" max={today} {...field('workDate')} />
          <TextField label="Hours" required type="number" inputMode="decimal" min="0.25" max="24" step="0.25" {...field('totalHours')} />
        </div>
      </form>
    </Modal>
  )
}
