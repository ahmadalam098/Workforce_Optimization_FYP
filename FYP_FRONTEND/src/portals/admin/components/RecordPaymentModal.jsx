import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { PAYMENT_METHOD_OPTIONS } from '../../../constants/billing.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { invoicesApi } from '../../../services/adminService.js'
import { formatCurrency } from '../../../utils/format.js'
import { onlyErrors, validateChoice, validateDate, validateNumber, validateText } from '../../../utils/validators.js'

/** Record money received for an issued invoice. The USD to PKR rate is stored with the payment. */
function RecordPaymentModal({ invoice, onClose, onSaved }) {
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const needsRate = invoice.currency !== 'PKR'

  const { form, field, checkAll, addServerErrors } = useFormFields(
    { amount: String(invoice.balance), paidAt: '', method: 'Bank transfer', reference: '', notes: '', exchangeRate: '' },
    (values) => {
      const errors = {
        amount: validateNumber(values.amount, { label: 'Amount', positive: true, decimals: 2, max: 1000000000 }),
        paidAt: validateDate(values.paidAt, { label: 'Received on', required: false, notInFuture: true }),
        method: validateChoice(values.method, PAYMENT_METHOD_OPTIONS, 'Method'),
        reference: validateText(values.reference, { label: 'Reference', required: false, max: 100 }),
        notes: validateText(values.notes, { label: 'Notes', required: false, max: 255 }),
        exchangeRate: needsRate ? validateNumber(values.exchangeRate, { label: 'Rate', required: false, positive: true, max: 1000000, decimals: 6 }) : '',
      }
      if (!errors.amount && Number(values.amount) > invoice.balance + 0.004) {
        errors.amount = `That is more than the balance (${formatCurrency(invoice.balance, invoice.currency)}).`
      }
      return onlyErrors(errors)
    },
  )

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }

    setSubmitting(true)
    setServerError('')
    try {
      const result = await invoicesApi.recordPayment(invoice.invoiceId, {
        amount: Number(form.amount),
        paidAt: form.paidAt ? new Date(form.paidAt).toISOString() : undefined,
        method: form.method,
        reference: form.reference.trim() || undefined,
        notes: form.notes.trim() || undefined,
        exchangeRate: form.exchangeRate === '' ? undefined : Number(form.exchangeRate),
      })
      onSaved(result?.message || 'Payment recorded.')
    } catch (error) {
      addServerErrors(error.fieldErrors)
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Record payment"
      subtitle={`${invoice.invoiceNumber} · balance ${formatCurrency(invoice.balance, invoice.currency)}`}
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="payment-form" loading={submitting}>
            Record payment
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}

        <div className="form-grid">
          <TextField label={`Amount (${invoice.currency})`} required type="number" inputMode="decimal" min="0" step="0.01" {...field('amount')} />
          <TextField label="Received on (optional)" type="datetime-local" max={new Date().toISOString().slice(0, 16)} hint="Leave empty for now." {...field('paidAt')} />
          <SelectField label="Method" required options={PAYMENT_METHOD_OPTIONS} {...field('method')} />
          <TextField label="Reference (optional)" maxLength={100} placeholder="Transfer or cheque number" autoComplete="off" {...field('reference')} />
          {needsRate && (
            <TextField
              label={`${invoice.currency} to PKR rate (optional)`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.0001"
              className="form-grid__full"
              hint="Leave empty to use the stored exchange rate. Required only when none is stored."
              {...field('exchangeRate')}
            />
          )}
          <TextField label="Notes (optional)" className="form-grid__full" maxLength={255} autoComplete="off" {...field('notes')} />
        </div>
      </form>
    </Modal>
  )
}

export default RecordPaymentModal
