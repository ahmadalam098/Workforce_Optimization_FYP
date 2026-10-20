import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { organizationPaymentsApi } from '../../../services/organization/organizationService.js'
import { formatCurrency } from '../../../utils/format.js'
import { validateNumber } from '../../../utils/validators.js'

/** Pay an invoice online: choose the amount (the whole payable amount by default), then go to the payment page of the gateway. */
function PayOnlineModal({ invoice, demo, onClose }) {
  const [amount, setAmount] = useState(String(invoice.payable))
  const [error, setError] = useState('')
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const problem = validateNumber(amount, { label: 'The amount', min: 0.01, max: invoice.payable, decimals: 2, positive: true })
    setError(problem)
    if (problem) return
    setSubmitting(true)
    setServerError('')
    try {
      const result = await organizationPaymentsApi.startOnline({ invoiceId: invoice.invoiceId, amount: Number(amount) })
      window.location.assign(result.checkoutPath)
    } catch (problemFound) {
      setServerError(problemFound.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Pay online"
      subtitle={`${invoice.invoiceNumber} · ${formatCurrency(invoice.payable, invoice.currency)} can be paid now`}
      size="sm"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="pay-online-form" loading={submitting}>
            Go to the payment page
          </Button>
        </>
      }
    >
      <form id="pay-online-form" onSubmit={submit} noValidate className="form-stack">
        {demo && <Alert type="warning">This is a demo payment gateway: nothing is charged, but the payment and its receipt are recorded like a real one.</Alert>}
        {serverError && <Alert type="error">{serverError}</Alert>}
        <TextField label={`Amount to pay (${invoice.currency})`} inputMode="decimal" hint="Pay a part now and the rest later if you want." value={amount} onChange={(event) => setAmount(event.target.value)} error={error} />
        <p className="cell-muted">You are taken to the gateway's page to pay. When it confirms, your receipt appears here and in your Payments page.</p>
      </form>
    </Modal>
  )
}

export default PayOnlineModal
