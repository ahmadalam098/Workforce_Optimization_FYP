import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { invoicesApi } from '../../../services/admin/adminService.js'
import { formatCurrency } from '../../../utils/format.js'
import { validateDate, validateDateOrder } from '../../../utils/validators.js'

/** First and last day of last month, as yyyy-mm-dd, for the default period. */
function lastMonth() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 0)
  const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { start: iso(start), end: iso(end) }
}

/**
 * Create a draft invoice. "Preview" works out the lines from the contract rates and the hours employees
 * were allocated to the organization; nothing is saved until "Create draft invoice".
 */
function InvoiceCreateModal({ organizations, onClose, onCreated }) {
  const defaults = lastMonth()
  const [organizationId, setOrganizationId] = useState('')
  const [periodStart, setPeriodStart] = useState(defaults.start)
  const [periodEnd, setPeriodEnd] = useState(defaults.end)
  const [preview, setPreview] = useState(null)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState('') // '' | 'preview' | 'create'

  const organizationOptions = organizations
    .filter((org) => org.status === 'Active' || org.status === 'Approved')
    .map((org) => ({ value: String(org.organizationId), label: org.name }))

  function changed() {
    setPreview(null)
    setServerError('')
  }

  function validate() {
    const next = {}
    if (!organizationId) next.orgId = 'Select an organization.'
    const startError = validateDate(periodStart, { label: 'The first day' })
    const endError = validateDate(periodEnd, { label: 'The last day', notInFuture: true })
    if (startError) next.periodStart = startError
    if (endError) next.periodEnd = endError
    if (!startError && !endError) {
      const order = validateDateOrder(periodStart, periodEnd, { endLabel: 'The last day', startLabel: 'the first day', allowSame: true })
      if (order) next.periodEnd = order
      else if ((new Date(`${periodEnd}T00:00:00`) - new Date(`${periodStart}T00:00:00`)) / 86400000 > 366) next.periodEnd = 'An invoice can cover at most one year.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const body = () => ({ orgId: Number(organizationId), periodStart, periodEnd })

  async function handlePreview() {
    if (!validate()) return
    setBusy('preview')
    setServerError('')
    try {
      setPreview(await invoicesApi.preview(body()))
    } catch (error) {
      setErrors((current) => ({ ...current, ...error.fieldErrors }))
      setServerError(error.message)
    } finally {
      setBusy('')
    }
  }

  async function handleCreate() {
    setBusy('create')
    setServerError('')
    try {
      const result = await invoicesApi.create(body())
      onCreated(result)
    } catch (error) {
      setServerError(error.message)
      setBusy('')
    }
  }

  return (
    <Modal
      title="New invoice"
      subtitle="Billed from the contract rates and the hours employees were allocated to the organization."
      size="lg"
      onClose={onClose}
      busy={Boolean(busy)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={Boolean(busy)}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={handlePreview} loading={busy === 'preview'} disabled={Boolean(busy)}>
            Preview
          </Button>
          <Button onClick={handleCreate} loading={busy === 'create'} disabled={!preview || Boolean(busy)}>
            Create draft invoice
          </Button>
        </>
      }
    >
      <div className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}

        <div className="form-grid">
          <SelectField
            label="Organization"
            className="form-grid__full"
            value={organizationId}
            onChange={(event) => {
              setOrganizationId(event.target.value)
              setErrors((current) => ({ ...current, orgId: '' }))
              changed()
            }}
            options={organizationOptions}
            placeholder="Select an organization"
            error={errors.orgId}
          />
          <TextField label="Period start" required type="date" value={periodStart} onChange={(event) => { setPeriodStart(event.target.value); changed() }} error={errors.periodStart} />
          <TextField label="Period end" required type="date" value={periodEnd} onChange={(event) => { setPeriodEnd(event.target.value); changed() }} error={errors.periodEnd} />
        </div>

        {preview && (
          <div className="form-stack">
            <p className="term-group__title">
              {preview.orgName} · contract {preview.contractNumber} · {preview.currency}
            </p>

            {preview.warnings.map((warning) => (
              <Alert key={warning} type="info">
                {warning}
              </Alert>
            ))}

            {preview.lines.length > 0 && (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th className="num">Hours</th>
                      <th className="num">Rate</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.map((line) => (
                      <tr key={line.lineType}>
                        <td>{line.description}</td>
                        <td className="num">{line.quantity}</td>
                        <td className="num">{formatCurrency(line.unitRate, preview.currency)}</td>
                        <td className="num">{formatCurrency(line.amount, preview.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>
                        <strong>Total</strong>
                      </td>
                      <td className="num">
                        <strong>{formatCurrency(preview.total, preview.currency)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="cell-muted">
              Based on {preview.allocationCount} allocation{preview.allocationCount === 1 ? '' : 's'}.
              {preview.baseEmployees != null && ` Up to ${preview.baseEmployees} employee${preview.baseEmployees === 1 ? '' : 's'} at a time are billed at the base rate; additional ones at the extra rate.`}
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default InvoiceCreateModal
