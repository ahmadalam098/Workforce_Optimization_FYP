import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { CURRENCY_OPTIONS } from '../../../constants/contracts.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { salariesApi } from '../../../services/adminService.js'
import { formatCurrency, formatDate } from '../../../utils/format.js'
import { onlyErrors, validateChoice, validateDate, validateNumber, validateText } from '../../../utils/validators.js'
import { useFormFields } from '../../../hooks/useFormFields.js'

const today = () => new Date().toISOString().slice(0, 10)

function validateSalary(form) {
  return onlyErrors({
    monthlySalary: validateNumber(form.monthlySalary, { label: 'Monthly salary', positive: true, max: 100000000, decimals: 2 }),
    currency: validateChoice(form.currency, CURRENCY_OPTIONS, 'Currency'),
    overtimeRate: validateNumber(form.overtimeRate, { label: 'Overtime rate', required: false, min: 0, max: 1000000, decimals: 2 }),
    effectiveFrom: validateDate(form.effectiveFrom, { label: 'Start date' }),
    notes: validateText(form.notes, { label: 'Notes', required: false, max: 255 }),
  })
}

/** Set or change the salary of one employee. The previous salary ends the day before the new one starts. */
export function SalaryFormModal({ employee, onClose, onSaved }) {
  const hasCurrent = employee.monthlySalary != null
  const { form, field, checkAll, addServerErrors } = useFormFields(
    {
      monthlySalary: hasCurrent ? String(employee.monthlySalary) : '',
      currency: employee.currency || 'PKR',
      overtimeRate: employee.overtimeRate != null ? String(employee.overtimeRate) : '',
      effectiveFrom: today(),
      notes: '',
    },
    validateSalary,
  )
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }

    setSubmitting(true)
    setServerError('')
    try {
      await salariesApi.set(employee.employeeId, {
        monthlySalary: Number(form.monthlySalary),
        currency: form.currency,
        overtimeRate: form.overtimeRate === '' ? undefined : Number(form.overtimeRate),
        effectiveFrom: form.effectiveFrom,
        notes: form.notes.trim() || undefined,
      })
      onSaved(`Salary saved for ${employee.fullName}.`)
    } catch (error) {
      addServerErrors(error.fieldErrors)
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={hasCurrent ? 'Change salary' : 'Set salary'}
      subtitle={employee.fullName}
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="salary-form" loading={submitting}>
            Save salary
          </Button>
        </>
      }
    >
      <form id="salary-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        {hasCurrent && (
          <Alert type="info">
            Current: {formatCurrency(employee.monthlySalary, employee.currency)} since {formatDate(employee.effectiveFrom)}. It ends the day before the new one starts and stays in the history.
          </Alert>
        )}

        <div className="form-grid">
          <TextField label="Monthly salary" required type="number" inputMode="decimal" min="0" max="100000000" step="0.01" {...field('monthlySalary')} />
          <SelectField label="Currency" required options={CURRENCY_OPTIONS} {...field('currency')} />
          <TextField
            label="Overtime rate per hour (optional)"
            type="number"
            inputMode="decimal"
            min="0"
            max="1000000"
            step="0.01"
            hint="Leave empty to use salary ÷ working hours × the overtime multiplier (Payment Rules)."
            {...field('overtimeRate')}
          />
          <TextField label="Starts on" required type="date" {...field('effectiveFrom')} />
          <TextField label="Notes (optional)" className="form-grid__full" maxLength={255} autoComplete="off" {...field('notes')} />
        </div>
      </form>
    </Modal>
  )
}

/** Every salary an employee has had. */
export function SalaryHistoryModal({ employee, onClose }) {
  const { data, error, loading } = useFetch((signal) => salariesApi.history(employee.employeeId, signal), `salary-history-${employee.employeeId}`)

  return (
    <Modal title="Salary history" subtitle={employee.fullName} size="lg" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {error && !data ? (
        <Alert type="error">{error.message}</Alert>
      ) : !data && loading ? (
        <Spinner label="Loading history..." />
      ) : data.length === 0 ? (
        <p className="cell-muted">No salary has been set yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th className="num">Salary</th>
                <th className="num">Overtime / h</th>
                <th>Set by</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.structureId}>
                  <td className="cell-date">{formatDate(row.effectiveFrom)}</td>
                  <td className="cell-date">{row.effectiveTo ? formatDate(row.effectiveTo) : <strong>Current</strong>}</td>
                  <td className="num">{formatCurrency(row.monthlySalary, row.currency)}</td>
                  <td className="num">
                    {formatCurrency(row.effectiveOvertimeRate, row.currency)}
                    {row.overtimeRate == null && <span className="person__sub">calculated</span>}
                  </td>
                  <td className="cell-muted">
                    {row.createdBy || '—'}
                    {row.notes && <span className="person__sub">{row.notes}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
