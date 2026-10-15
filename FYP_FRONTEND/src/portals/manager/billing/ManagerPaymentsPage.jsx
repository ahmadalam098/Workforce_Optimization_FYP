import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../../components/ui/Button.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { managerApi, managerBillingApi } from '../../../services/manager/managerService.js'
import { formatCurrency, formatDateTime } from '../../../utils/format.js'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import { VerifiedBadge } from './ManagerInvoicesPage.jsx'

const PAGE_SIZE = 10

const VERIFIED_OPTIONS = [
  { value: 'false', label: 'Not verified yet' },
  { value: 'true', label: 'Verified' },
]

/** Organization Manager: every payment made on the invoices of my organizations, to check and verify. */
function ManagerPaymentsPage() {
  const [search, setSearch] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [verified, setVerified] = useState('')
  const [page, setPage] = useState(1)
  const [verifyTarget, setVerifyTarget] = useState(null)
  const [notice, setNotice] = useFlashNotice()

  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), organizationId, verified, page, pageSize: PAGE_SIZE }

  const { data, error, loading, reload } = useFetch((signal) => managerBillingApi.payments(params, signal), JSON.stringify(params))
  const { data: overview } = useFetch((signal) => managerApi.overview(signal), 'manager-overview')

  const organizations = overview?.organizations ?? []
  const organizationOptions = organizations.map((org) => ({ value: String(org.organizationId), label: org.name }))
  const items = data?.items ?? []
  const filtered = Boolean(debouncedSearch || organizationId || verified)

  const changeFilter = (setter) => (event) => {
    setter(event.target.value)
    setPage(1)
  }

  async function handleVerify() {
    const result = await managerBillingApi.verifyPayment(verifyTarget.paymentId)
    setNotice(result?.message || 'Payment verified.')
    setVerifyTarget(null)
    reload()
  }

  return (
    <div className="page">
      <PageHeader title="Payments" description="Payments recorded on the invoices of your organizations. Check each one and mark it as verified." />
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card">
        <div className="toolbar">
          <TextField
            className="toolbar__search"
            label="Search payments"
            icon="search"
            placeholder="Search by invoice number, organization or reference"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          {organizations.length > 1 && (
            <SelectField className="toolbar__filter" label="Organization" value={organizationId} onChange={changeFilter(setOrganizationId)} options={organizationOptions} placeholder="All organizations" />
          )}
          <SelectField className="toolbar__filter" label="Verification" value={verified} onChange={changeFilter(setVerified)} options={VERIFIED_OPTIONS} placeholder="All" />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading payments..." />
        ) : items.length === 0 ? (
          <EmptyState icon="clock" title="No payments found" text={filtered ? 'Try changing or clearing the filters.' : 'Payments appear here once the administrator records them.'} />
        ) : (
          <>
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Received</th>
                    <th>Invoice</th>
                    <th className="num">Amount</th>
                    <th>Method</th>
                    <th>Verification</th>
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((payment) => (
                    <tr key={payment.paymentId}>
                      <td className="cell-muted cell-date">{formatDateTime(payment.paidAt)}</td>
                      <td>
                        <Link to={`/manager/invoices/${payment.invoiceId}`}>{payment.invoiceNumber || `#${payment.invoiceId}`}</Link>
                        <span className="person__sub">{payment.orgName}</span>
                      </td>
                      <td className="num">{formatCurrency(payment.amount, payment.currency)}</td>
                      <td>
                        {payment.method || '—'}
                        {payment.reference && <span className="person__sub">{payment.reference}</span>}
                      </td>
                      <td>
                        <VerifiedBadge verifiedAt={payment.verifiedAt} verifiedBy={payment.verifiedBy} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {!payment.verifiedAt && (
                            <Button variant="secondary" onClick={() => setVerifyTarget(payment)}>
                              Verify
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </section>

      {verifyTarget && (
        <ConfirmDialog
          title="Verify payment?"
          message={`You confirm that the payment of ${formatCurrency(verifyTarget.amount, verifyTarget.currency)} on invoice ${verifyTarget.invoiceNumber} (${formatDateTime(verifyTarget.paidAt)}) was made.`}
          confirmLabel="Verify"
          onConfirm={handleVerify}
          onCancel={() => setVerifyTarget(null)}
        />
      )}
    </div>
  )
}

export default ManagerPaymentsPage
