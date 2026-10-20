import { useState } from 'react'
import Button from '../../../components/ui/Button.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import SubmissionsTable from '../../../components/payments/SubmissionsTable.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { managerSubmissionsApi } from '../../../services/manager/managerService.js'
import { formatCurrency } from '../../../utils/format.js'
import DecisionModal from '../../admin/shared/DecisionModal.jsx'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'

const FILTERS = ['Pending', 'Verified', 'Approved', 'Rejected', 'Withdrawn'].map((value) => ({ value, label: value === 'Pending' ? 'To verify' : value }))

/** Organization Manager: payments your organizations say they made. Check the reference and the proof, then verify it (the admin approves next) or reject it with a reason. */
function ManagerPaymentNoticesPage() {
  const [status, setStatus] = useState('Pending')
  const [verifying, setVerifying] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [notice, setNotice] = useFlashNotice()
  const { data, error, loading, reload } = useFetch((signal) => managerSubmissionsApi.list(status, signal), `manager-submissions-${status}`)
  const rows = data ?? []

  return (
    <div className="page">
      <PageHeader title="Payment Notices" description="Your organizations tell you here that they paid an invoice. Open the proof, check the reference, and verify it. The admin then approves it and the receipt is made." />
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
          <EmptyState icon="file" title="Nothing here" text={status === 'Pending' ? 'No payment is waiting for your check.' : 'No payment notice in this list.'} />
        ) : (
          <SubmissionsTable
            rows={rows}
            invoiceLink={(row) => `/manager/invoices/${row.invoiceId}`}
            receiptLink={(row) => `/manager/documents/receipt/${row.paymentId}`}
            actions={(row) =>
              row.status === 'Pending' ? (
                <div className="row-actions">
                  <Button onClick={() => setVerifying(row)}>Verify</Button>
                  <Button variant="secondary" onClick={() => setRejecting(row)}>
                    Reject
                  </Button>
                </div>
              ) : null
            }
          />
        )}
      </section>

      {verifying && (
        <ConfirmDialog
          title="Verify this payment?"
          message={`You confirm that you checked the reference${verifying.hasProof ? ' and the proof' : ''} of ${formatCurrency(verifying.amount, verifying.currency)} paid by ${verifying.orgName} for ${verifying.invoiceNumber}. The admin approves it next.`}
          confirmLabel="Verify"
          onConfirm={async () => {
            const result = await managerSubmissionsApi.verify(verifying.submissionId)
            setVerifying(null)
            setNotice(result?.message || 'Verified.')
            reload()
          }}
          onCancel={() => setVerifying(null)}
        />
      )}
      {rejecting && (
        <DecisionModal
          title="Reject this payment?"
          description="The organization sees your reason and can announce the payment again."
          label="Why is it not accepted?"
          required
          danger
          confirmLabel="Reject"
          onSubmit={async (reason) => {
            const result = await managerSubmissionsApi.reject(rejecting.submissionId, reason)
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

export default ManagerPaymentNoticesPage
