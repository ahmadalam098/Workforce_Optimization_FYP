import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { invoicesApi } from '../../../services/adminService.js'
import { formatCurrency } from '../../../utils/format.js'
import { onlyErrors, validateNumber, validateText } from '../../../utils/validators.js'

function validateAdjustment(form) {
  const errors = {
    description: validateText(form.description, { label: 'Description', min: 3, max: 150 }),
    quantity: validateNumber(form.quantity, { label: 'Quantity', positive: true, max: 100000, decimals: 2 }),
    unitRate: validateNumber(form.unitRate, { label: 'Rate', min: -10000000, max: 10000000, decimals: 2 }),
  }
  if (!errors.unitRate && Number(form.unitRate) === 0) errors.unitRate = 'The rate cannot be 0.'
  return onlyErrors(errors)
}

/** Add an adjustment to a draft invoice: a minimum guarantee, a discount (negative rate), a one-off charge ... */
function AdjustmentLineModal({ invoice, onClose, onSaved }) {
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { form, field, checkAll, addServerErrors } = useFormFields({ description: '', quantity: '1', unitRate: '' }, validateAdjustment)

  const amount = Number(form.quantity) * Number(form.unitRate)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) return

    setSubmitting(true)
    setServerError('')
    try {
      await invoicesApi.addLine(invoice.invoiceId, { description: form.description.trim(), quantity: Number(form.quantity), unitRate: Number(form.unitRate) })
      onSaved('Line added.')
    } catch (error) {
      addServerErrors(error.fieldErrors)
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Add adjustment"
      subtitle="Amount = quantity × rate. Use a negative rate for a discount."
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="adjustment-form" loading={submitting}>
            Add line
          </Button>
        </>
      }
    >
      <form id="adjustment-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <TextField label="Description" required maxLength={150} placeholder="e.g. Minimum guarantee" autoComplete="off" {...field('description')} />
        <div className="form-grid">
          <TextField label="Quantity" required type="number" inputMode="decimal" min="0" step="0.01" {...field('quantity')} />
          <TextField label={`Rate (${invoice.currency})`} required type="number" inputMode="decimal" step="0.01" {...field('unitRate')} />
        </div>
        {!Number.isNaN(amount) && form.unitRate !== '' && (
          <p className="cell-muted">
            Line amount: <strong>{formatCurrency(amount, invoice.currency)}</strong>
          </p>
        )}
      </form>
    </Modal>
  )
}

export default AdjustmentLineModal
