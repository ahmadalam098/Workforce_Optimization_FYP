import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import { organizationPaymentsApi } from '../../../services/organization/organizationService.js'
import { formatCurrency } from '../../../utils/format.js'
import './PayOnlineModal.css'

/** Pay an invoice online: always the whole open balance, in one payment, on the gateway's page (Safepay). */
function PayOnlineModal({ invoice, demo, gateway, onClose }) {
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    setServerError('')
    try {
      const result = await organizationPaymentsApi.startOnline({ invoiceId: invoice.invoiceId })
      window.location.assign(result.checkoutPath)
    } catch (problemFound) {
      setServerError(problemFound.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Pay online"
      subtitle={invoice.invoiceNumber}
      size="sm"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="pay-online-form" loading={submitting}>
            Pay {formatCurrency(invoice.balance, invoice.currency)}
          </Button>
        </>
      }
    >
      <form id="pay-online-form" onSubmit={submit} noValidate className="form-stack">
        {demo && <Alert type="warning">This is a demo payment gateway: nothing is charged, but the payment and its receipt are recorded like a real one.</Alert>}
        {gateway === 'Safepay' && <Alert type="info">You will pay on Safepay's secure page (card, bank account or wallet). We never see your card details.</Alert>}
        {serverError && <Alert type="error">{serverError}</Alert>}
        <div className="pay-online__amount">
          <span className="cell-muted">Amount to pay (the whole invoice balance)</span>
          <strong>{formatCurrency(invoice.balance, invoice.currency)}</strong>
        </div>
        <p className="cell-muted">The invoice is paid in full in one payment. When it goes through, the invoice is marked paid and your receipt appears in your Payments page.</p>
      </form>
    </Modal>
  )
}

export default PayOnlineModal
