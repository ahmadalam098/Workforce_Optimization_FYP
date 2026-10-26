import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { managerBillingApi, managerApi } from '../../../services/manager/managerService.js'
import { formatCurrency, formatCurrencyWhole, formatDate } from '../../../utils/format.js'
import '../../admin/finance/FinanceTiles.css'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import InvoiceCreateModal from './InvoiceCreateModal.jsx'
import ViewButton from '../../admin/shared/ViewButton.jsx'
import WorkflowBadge from '../../admin/shared/WorkflowBadge.jsx'

const PAGE_SIZE = 10

const STATUS_OPTIONS = [
  { value: 'Draft', label: 'My drafts (not sent yet)' },
  { value: 'PendingVerification', label: 'Waiting for the admin' },
  { value: 'Issued', label: 'Issued' },
  { value: 'PartiallyPaid', label: 'Partly paid' },
  { value: 'Overdue', label: 'Overdue' },
  { value: 'Paid', label: 'Paid' },
  { value: 'Cancelled', label: 'Cancelled' },
]

const VERIFIED_OPTIONS = [
  { value: 'false', label: 'Not verified by the admin yet' },
  { value: 'true', label: 'Verified by the admin' },
]

export function VerifiedBadge({ verifiedAt, verifiedBy }) {
  return verifiedAt ? (
    <Badge tone="success" dot>
      Verified{verifiedBy ? ` by ${verifiedBy}` : ''}
    </Badge>
  ) : (
    <Badge tone="warning">To verify</Badge>
  )
}

/** Organization Manager: prepare the invoices of my organizations, send them to the admin (who verifies them), and follow the money. */
function ManagerInvoicesPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [verified, setVerified] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const [notice, setNotice] = useFlashNotice()

  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), status, organizationId, verified, page, pageSize: PAGE_SIZE }

  const { data, error, loading, reload } = useFetch((signal) => managerBillingApi.invoices(params, signal), JSON.stringify(params))
  const { data: summary } = useFetch((signal) => managerBillingApi.summary(signal), 'manager-billing-summary')
  const { data: overview } = useFetch((signal) => managerApi.overview(signal), 'manager-overview')

  const organizations = overview?.organizations ?? []
  const organizationOptions = organizations.map((org) => ({ value: String(org.organizationId), label: org.name }))
  const items = data?.items ?? []
  const filtered = Boolean(debouncedSearch || status || organizationId || verified)

  const changeFilter = (setter) => (event) => {
    setter(event.target.value)
    setPage(1)
  }

  return (
    <div className="page">
      <PageHeader
        title="Invoices"
        description="You prepare the invoices of your organizations from the contract rates and the allocated hours, check them and send them to the admin. The admin verifies each one, which issues it to the organization."
        actions={
          <Button onClick={() => setCreating(true)} disabled={organizations.length === 0}>
            <Icon name="plus" size={18} /> New invoice
          </Button>
        }
      />
      <Notice message={notice} onClose={() => setNotice('')} />

      {summary && (
        <section className="finance-tiles" aria-label="Money overview">
          {summary.currencies.length === 0 ? (
            <article className="card finance-tile">
              <p className="finance-tile__label">Invoiced</p>
              <p className="finance-tile__value">—</p>
              <p className="finance-tile__caption">No invoices have been issued yet</p>
            </article>
          ) : (
            summary.currencies.map((row) => (
              <article className={`card finance-tile ${row.overdueInvoices > 0 ? 'finance-tile--danger' : ''}`} key={row.currency}>
                <p className="finance-tile__label">Outstanding ({row.currency})</p>
                <p className="finance-tile__value">{formatCurrencyWhole(row.outstanding, row.currency)}</p>
                <p className="finance-tile__caption">
                  {formatCurrencyWhole(row.paid, row.currency)} paid of {formatCurrencyWhole(row.invoiced, row.currency)}
                  {row.overdueInvoices > 0 && ` · ${row.overdueInvoices} overdue`}
                </p>
              </article>
            ))
          )}
          <article className={`card finance-tile ${summary.draftsToSend > 0 ? 'finance-tile--gold' : ''}`}>
            <p className="finance-tile__label">Drafts to send</p>
            <p className="finance-tile__value">{summary.draftsToSend}</p>
            <p className="finance-tile__caption">
              {summary.returnedDrafts > 0 ? `${summary.returnedDrafts} sent back by the admin · ` : ''}
              {summary.waitingForAdmin} waiting for the admin
            </p>
          </article>
          <article className={`card finance-tile ${summary.unverifiedPayments > 0 ? 'finance-tile--gold' : ''}`}>
            <p className="finance-tile__label">Payments to verify</p>
            <p className="finance-tile__value">{summary.unverifiedPayments}</p>
            <p className="finance-tile__caption">
              <Link to="/manager/payments">Open payments</Link>
            </p>
          </article>
        </section>
      )}

      <section className="card">
        <div className="toolbar">
          <TextField
            className="toolbar__search"
            label="Search invoices"
            icon="search"
            placeholder="Search by invoice number or organization"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          {organizations.length > 1 && (
            <SelectField className="toolbar__filter" label="Organization" value={organizationId} onChange={changeFilter(setOrganizationId)} options={organizationOptions} placeholder="All organizations" />
          )}
          <SelectField className="toolbar__filter" label="Status" value={status} onChange={changeFilter(setStatus)} options={STATUS_OPTIONS} placeholder="All statuses" />
          <SelectField className="toolbar__filter" label="Verification" value={verified} onChange={changeFilter(setVerified)} options={VERIFIED_OPTIONS} placeholder="All" />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading invoices..." />
        ) : items.length === 0 ? (
          <EmptyState icon="file" title="No invoices found" text={filtered ? 'Try changing or clearing the filters.' : 'Press New invoice to prepare the first invoice for one of your organizations.'} />
        ) : (
          <>
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Period</th>
                    <th className="num">Total</th>
                    <th className="num">Paid</th>
                    <th className="num">Balance</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th>Admin check</th>
                    <th>View</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((invoice) => (
                    <tr key={invoice.invoiceId}>
                      <td>
                        <strong>{invoice.invoiceNumber || `#${invoice.invoiceId}`}</strong>
                        <span className="person__sub">{invoice.orgName}</span>
                      </td>
                      <td className="cell-muted">
                        {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
                      </td>
                      <td className="num">{formatCurrency(invoice.totalAmount, invoice.currency)}</td>
                      <td className="num">{formatCurrency(invoice.paidAmount, invoice.currency)}</td>
                      <td className="num">{formatCurrency(invoice.balance, invoice.currency)}</td>
                      <td>
                        <WorkflowBadge status={invoice.displayStatus} />
                      </td>
                      <td className="cell-muted">{formatDate(invoice.dueDate)}</td>
                      <td>
                        {invoice.status === 'Cancelled' ? (
                          <span className="cell-muted">—</span>
                        ) : invoice.status === 'Draft' ? (
                          <span className="cell-muted">{invoice.displayStatus === 'PendingVerification' ? 'With the admin' : invoice.returnedReason ? 'Sent back to you' : 'Not sent yet'}</span>
                        ) : invoice.verifiedAt ? (
                          <Badge tone="success" dot>
                            Verified{invoice.verifiedBy ? ` by ${invoice.verifiedBy}` : ''}
                          </Badge>
                        ) : (
                          <span className="cell-muted">—</span>
                        )}
                      </td>
                      <td>
                        <ViewButton to={`/manager/invoices/${invoice.invoiceId}`} label={`View ${invoice.invoiceNumber}`} />
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

      {creating && (
        <InvoiceCreateModal
          organizations={organizations}
          onClose={() => setCreating(false)}
          onCreated={(result) => {
            setCreating(false)
            setNotice(result.message || 'Draft invoice created.')
            if (result.invoiceId) navigate(`/manager/invoices/${result.invoiceId}`)
            else reload()
          }}
        />
      )}
    </div>
  )
}

export default ManagerInvoicesPage
