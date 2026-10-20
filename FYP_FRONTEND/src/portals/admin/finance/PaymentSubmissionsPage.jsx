import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import SubmissionsTable from '../../../components/payments/SubmissionsTable.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { paymentSubmissionsApi } from '../../../services/admin/adminService.js'
import { formatCurrency } from '../../../utils/format.js'
import { validateNumber } from '../../../utils/validators.js'
import DecisionModal from '../shared/DecisionModal.jsx'
import Notice from '../shared/Notice.jsx'
import PageHeader from '../shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'
import './FinanceTiles.css'

const FILTERS = [
  { value: 'Open', label: 'To decide' },
  { value: 'Verified', label: 'Verified' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'Withdrawn', label: 'Withdrawn' },
  { value: 'all', label: 'All' },
]

function ApproveModal({ row, onClose, onDone }) {
  const [rate, setRate] = useState('')
  const [error, setError] = useState('')
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const foreign = row.currency !== 'PKR'

  async function submit(event) {
    event.preventDefault()
    const problem = rate ? validateNumber(rate, { label: 'The exchange rate', min: 0.000001, max: 1000000, decimals: 6, positive: true }) : ''
    setError(problem)
    if (problem) return
    setSubmitting(true)
    setServerError('')
    try {
      const result = await paymentSubmissionsApi.approve(row.submissionId, { exchangeRate: rate ? Number(rate) : undefined })
      onDone(result?.message || 'Approved.')
    } catch (problemFound) {
      setServerError(problemFound.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Approve this payment?"
      subtitle={`${row.orgName} · ${row.invoiceNumber}`}
      size="sm"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="approve-payment-form" loading={submitting}>
            Approve and record
          </Button>
        </>
      }
    >
      <form id="approve-payment-form" onSubmit={submit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <p>
          The payment of <strong>{formatCurrency(row.amount, row.currency)}</strong> ({row.method}
          {row.reference ? `, ref ${row.reference}` : ''}) is recorded on the invoice, the organization gets its receipt, and the manager is told.
        </p>
        {row.verifiedBy ? <Alert type="success">Checked by {row.verifiedBy}.</Alert> : <Alert type="warning">The organization manager has not verified this payment. You can still approve it.</Alert>}
        {foreign && (
          <TextField
            label={`Exchange rate (${row.currency} to PKR)`}
            inputMode="decimal"
            hint="Leave empty to use the stored rate for the payment date."
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            error={error}
          />
        )}
      </form>
    </Modal>
  )
}

/** Admin: the payments organizations announced. The manager checks them first; you approve (the payment and its receipt are then recorded) or reject. */
function PaymentSubmissionsPage() {
  const [status, setStatus] = useState('Open')
  const [approving, setApproving] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [notice, setNotice] = useFlashNotice()
  const { data, error, loading, reload } = useFetch((signal) => paymentSubmissionsApi.list(status, signal), `admin-submissions-${status}`)
  const rows = data ?? []

  return (
    <div className="page">
      <PageHeader title="Payment Notices" description="Organizations tell you here that they paid an invoice, with the reference and a proof. Their manager checks it first; you approve it and the payment, with its receipt, is recorded." />
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card">
        <div className="toolbar">
          <SelectField className="toolbar__filter" label="Show" value={status} onChange={(event) => setStatus(event.target.value)} options={FILTERS} />
        </div>
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading..." />
        ) : rows.length === 0 ? (
          <EmptyState icon="file" title="Nothing here" text={status === 'Open' ? 'No payment is waiting for a decision.' : 'No payment notice in this list.'} />
        ) : (
          <SubmissionsTable
            rows={rows}
            invoiceLink={(row) => `/admin/invoices/${row.invoiceId}`}
            receiptLink={(row) => `/admin/documents/receipt/${row.paymentId}`}
            actions={(row) =>
              row.status === 'Pending' || row.status === 'Verified' ? (
                <div className="row-actions">
                  <Button onClick={() => setApproving(row)}>Approve</Button>
                  <Button variant="secondary" onClick={() => setRejecting(row)}>
                    Reject
                  </Button>
                </div>
              ) : null
            }
          />
        )}
      </section>

      {approving && (
        <ApproveModal
          row={approving}
          onClose={() => setApproving(null)}
          onDone={(message) => {
            setApproving(null)
            setNotice(message)
            reload()
          }}
        />
      )}
      {rejecting && (
        <DecisionModal
          title="Reject this payment?"
          description="The organization and its manager see your reason."
          label="Why is it not accepted?"
          required
          danger
          confirmLabel="Reject"
          onSubmit={async (reason) => {
            const result = await paymentSubmissionsApi.reject(rejecting.submissionId, reason)
            setRejecting(null)
            setNotice(result?.message || 'Rejected.')
            reload()
          }}
          onClose={() => setRejecting(null)}
        />
      )}
    </div>
  )
}

export default PaymentSubmissionsPage
