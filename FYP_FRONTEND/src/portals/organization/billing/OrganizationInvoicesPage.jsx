import { useState } from 'react'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { organizationBillingApi } from '../../../services/organization/organizationService.js'
import { formatCurrency, formatCurrencyWhole, formatDate } from '../../../utils/format.js'
import '../../admin/finance/FinanceTiles.css'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import ViewButton from '../../admin/shared/ViewButton.jsx'
import WorkflowBadge from '../../admin/shared/WorkflowBadge.jsx'

const PAGE_SIZE = 10

const STATUS_OPTIONS = [
  { value: 'Issued', label: 'Issued (not paid yet)' },
  { value: 'PartiallyPaid', label: 'Partly paid' },
  { value: 'Overdue', label: 'Overdue' },
  { value: 'Paid', label: 'Paid' },
  { value: 'Cancelled', label: 'Cancelled' },
]

/** Organization: its invoices, with the money overview. Read only. */
function OrganizationInvoicesPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebouncedValue(search)
  const params = { search: debounced.trim(), status, page, pageSize: PAGE_SIZE }
  const { data, error, loading, reload } = useFetch((signal) => organizationBillingApi.invoices(params, signal), JSON.stringify(params))
  const { data: summary } = useFetch((signal) => organizationBillingApi.summary(signal), 'organization-billing-summary')
  const items = data?.items ?? []

  return (
    <div className="page">
      <PageHeader title="Invoices" description="What you are billed for the employees who worked for you, and what you have paid." />

      {summary && (
        <section className="finance-tiles" aria-label="Money overview">
          {summary.currencies.length === 0 ? (
            <article className="card finance-tile">
              <p className="finance-tile__label">Invoiced</p>
              <p className="finance-tile__value">—</p>
              <p className="finance-tile__caption">No invoice has been issued to you yet</p>
            </article>
          ) : (
            summary.currencies.map((row) => (
              <article className={`card finance-tile ${row.overdueInvoices > 0 ? 'finance-tile--danger' : ''}`} key={row.currency}>
                <p className="finance-tile__label">To pay ({row.currency})</p>
                <p className="finance-tile__value">{formatCurrencyWhole(row.outstanding, row.currency)}</p>
                <p className="finance-tile__caption">
                  {formatCurrencyWhole(row.paid, row.currency)} paid of {formatCurrencyWhole(row.invoiced, row.currency)}
                  {row.overdueInvoices > 0 && ` · ${row.overdueInvoices} overdue`}
                </p>
              </article>
            ))
          )}
        </section>
      )}

      <section className="card">
        <div className="toolbar">
          <TextField
            className="toolbar__search"
            label="Search invoices"
            icon="search"
            placeholder="Invoice number"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <SelectField
            className="toolbar__filter"
            label="Status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setPage(1)
            }}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
          />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading invoices..." />
        ) : items.length === 0 ? (
          <EmptyState icon="file" title="No invoices found" text={search || status ? 'Try changing or clearing the filters.' : 'Your invoices appear here as soon as they are issued.'} />
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
                    <th>View</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((invoice) => (
                    <tr key={invoice.invoiceId}>
                      <td>
                        <strong>{invoice.invoiceNumber || `#${invoice.invoiceId}`}</strong>
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
                        <ViewButton to={`/organization/invoices/${invoice.invoiceId}`} label={`View ${invoice.invoiceNumber}`} />
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
    </div>
  )
}

export default OrganizationInvoicesPage
