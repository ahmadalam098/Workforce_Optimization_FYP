import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { CURRENCY_OPTIONS } from '../../../constants/contracts.js'
import Badge from '../../../components/ui/Badge.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { salariesApi } from '../../../services/admin/adminService.js'
import { formatCurrency, formatDate, formatMonth } from '../../../utils/format.js'
import { onlyErrors, validateChoice, validateDate, validateNumber, validateText } from '../../../utils/validators.js'
import { useFormFields } from '../../../hooks/useFormFields.js'

const today = () => new Date().toISOString().slice(0, 10)

function validateSalary(form) {
  return onlyErrors({
    monthlySalary: validateNumber(form.monthlySalary, { label: 'Monthly salary', positive: true, max: 100000000, decimals: 2 }),
    currency: validateChoice(form.currency, CURRENCY_OPTIONS, 'Currency'),
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
                <th>Set by</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.structureId}>
                  <td className="cell-date">{formatDate(row.effectiveFrom)}</td>
                  <td className="cell-date">{row.effectiveTo ? formatDate(row.effectiveTo) : <strong>Current</strong>}</td>
                  <td className="num">{formatCurrency(row.monthlySalary, row.currency)}</td>
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

const MONTH_TONES = { Paid: 'success', Approved: 'info', Draft: 'neutral', NotProcessed: 'warning', Upcoming: 'neutral', BeforeStart: 'neutral' }

function totals(list) {
  if (!list || list.length === 0) return '—'
  return list.map((entry) => formatCurrency(entry.amount, entry.currency || 'PKR')).join(' + ')
}

/** Month by month for one employee: which months of the year were paid and which are still to be paid. */
export function SalaryMonthsModal({ employee, initialYear, onClose }) {
  const [year, setYear] = useState(initialYear ? String(initialYear) : '')
  const { data, error, loading } = useFetch((signal) => salariesApi.months(employee.employeeId, year, signal), `salary-months-${employee.employeeId}-${year}`)
  const yearOptions = (data?.years ?? []).map((value) => ({ value: String(value), label: String(value) }))

  return (
    <Modal title="Salary month by month" subtitle={employee.fullName} size="lg" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {error && !data ? (
        <Alert type="error">{error.message}</Alert>
      ) : !data && loading ? (
        <Spinner label="Loading months..." />
      ) : !data.currentSalary ? (
        <p className="cell-muted">No salary has been set for this employee yet, so there is nothing to pay.</p>
      ) : (
        <div className="form-stack" aria-busy={loading}>
          <div className="form-grid">
            <SelectField label="Year" value={String(data.year)} onChange={(event) => setYear(event.target.value)} options={yearOptions} />
            <div>
              <p className="field__label">Monthly salary</p>
              <p>
                <strong>{formatCurrency(data.currentSalary.monthlySalary, data.currentSalary.currency)}</strong> <span className="cell-muted">since {formatDate(data.currentSalary.since)}</span>
              </p>
            </div>
          </div>
          <p>
            <strong>Paid:</strong> {data.summary.paidMonths} {data.summary.paidMonths === 1 ? 'month' : 'months'} ({totals(data.summary.received)}) · <strong>Still to pay:</strong> {data.summary.pendingMonths}{' '}
            {data.summary.pendingMonths === 1 ? 'month' : 'months'} ({totals(data.summary.pending)})
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Status</th>
                  <th className="num">Salary</th>
                  <th className="num">Overtime</th>
                  <th className="num">Adjustment</th>
                  <th className="num">Total</th>
                  <th>Paid on</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((month) => {
                  const faded = month.status === 'Upcoming' || month.status === 'BeforeStart'
                  return (
                    <tr key={month.month} className={faded ? 'is-inactive' : ''}>
                      <td><strong>{formatMonth(data.year, month.month)}</strong></td>
                      <td><Badge tone={MONTH_TONES[month.status] || 'neutral'}>{month.statusLabel}</Badge></td>
                      <td className="num">{month.baseSalary != null ? formatCurrency(month.baseSalary, month.currency) : '—'}</td>
                      <td className="num">{month.overtimeAmount ? formatCurrency(month.overtimeAmount, month.currency) : '—'}</td>
                      <td className="num">{month.adjustment ? formatCurrency(month.adjustment, month.currency) : '—'}</td>
                      <td className="num">
                        {month.totalAmount != null ? (
                          <strong>{formatCurrency(month.totalAmount, month.currency)}</strong>
                        ) : month.expectedAmount != null && !faded ? (
                          <span className="cell-muted">{formatCurrency(month.expectedAmount, month.currency)} due</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="cell-muted cell-date">{month.paidAt ? formatDate(month.paidAt) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}
