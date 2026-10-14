import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { INVOICE_STATUS_OPTIONS } from '../../../constants/billing.js'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { financeApi, invoicesApi, organizationsApi } from '../../../services/adminService.js'
import { formatCurrency, formatCurrencyWhole, formatDate, formatDateTime } from '../../../utils/format.js'
import PageHeader from '../components/PageHeader.jsx'
import { EmptyState, ErrorState } from '../components/StateBox.jsx'
import WorkflowBadge from '../components/WorkflowBadge.jsx'
import './FinanceTiles.css'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import Notice from '../components/Notice.jsx'
import ViewButton from '../components/ViewButton.jsx'

const PAGE_SIZE = 10

const TABS = [
  { id: 'invoices', label: 'Invoices' },
  { id: 'organizations', label: 'Payment status by organization' },
]

function amountsText(list) {
  if (!list || list.length === 0) return '—'
  return list.map((item) => formatCurrencyWhole(item.amount, item.currency)).join(' · ')
}

/** What organizations owe the company: invoices, payments and the money overview. */
function InvoicesPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('invoices')
  const [notice, setNotice] = useFlashNotice()

  const { data: summary, error: summaryError } = useFetch((signal) => financeApi.summary(signal), 'finance-summary')
  const { data: organizations } = useFetch((signal) => organizationsApi.lookup(signal), 'organizations')

  return (
    <div className="page">
      <PageHeader
        title="Invoices"
        description="Bills for client organizations, built from contract rates and allocated hours."
        actions={
          <Button onClick={() => navigate('/admin/invoices/new')}>
            <Icon name="plus" size={18} /> New invoice
          </Button>
        }
      />

      <Notice message={notice} onClose={() => setNotice('')} />

      {summary && !summary.hasExchangeRate && (
        <Alert type="info">
          No exchange rates are stored yet, so payments in USD cannot be converted to PKR automatically. Add a rate under{' '}
          <Link to="/admin/payment-rules?tab=rates">Payment Rules → Exchange rates</Link>.
        </Alert>
      )}

      {summary ? (
        <section className="finance-tiles" aria-label="Money overview">
          <article className="card finance-tile">
            <p className="finance-tile__label">Outstanding</p>
            <p className="finance-tile__value finance-tile__value--text">{amountsText(summary.outstanding)}</p>
            <p className="finance-tile__caption">{summary.draftInvoices} draft invoice{summary.draftInvoices === 1 ? '' : 's'}</p>
          </article>
          <article className={`card finance-tile ${summary.overdueInvoices > 0 ? 'finance-tile--danger' : ''}`}>
            <p className="finance-tile__label">Overdue</p>
            <p className="finance-tile__value finance-tile__value--text">{amountsText(summary.overdue)}</p>
            <p className="finance-tile__caption">{summary.overdueInvoices} invoice{summary.overdueInvoices === 1 ? '' : 's'} past the due date</p>
          </article>
          <article className="card finance-tile">
            <p className="finance-tile__label">Collected in {summary.month}</p>
            <p className="finance-tile__value">{formatCurrencyWhole(summary.collectedThisMonthPkr, 'PKR')}</p>
            <p className="finance-tile__caption">each payment at its stored rate</p>
          </article>
          <article className="card finance-tile">
            <p className="finance-tile__label">Payroll in {summary.month}</p>
            <p className="finance-tile__value">{formatCurrencyWhole(summary.payrollThisMonthPkr, 'PKR')}</p>
            <p className="finance-tile__caption">approved or paid runs</p>
          </article>
          <article className={`card finance-tile ${summary.profitThisMonthPkr < 0 ? 'finance-tile--danger' : 'finance-tile--gold'}`}>
            <p className="finance-tile__label">Profit in {summary.month}</p>
            <p className="finance-tile__value">{formatCurrencyWhole(summary.profitThisMonthPkr, 'PKR')}</p>
            <p className="finance-tile__caption">collected − payroll (calculated)</p>
          </article>
        </section>
      ) : (
        summaryError && <Alert type="error">{summaryError.message}</Alert>
      )}

      <div className="tabs" role="tablist" aria-label="Invoice views">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`tabs__tab ${tab === item.id ? 'is-active' : ''}`} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'invoices' ? <InvoiceList organizations={organizations ?? []} /> : <OrganizationStatus />}

    </div>
  )
}

function InvoiceList({ organizations }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), status, organizationId, page, pageSize: PAGE_SIZE }
  const { data, error, loading, reload } = useFetch((signal) => invoicesApi.list(params, signal), JSON.stringify(params))

  const organizationOptions = organizations.map((org) => ({ value: String(org.organizationId), label: org.name }))
  const items = data?.items ?? []
  const filtered = Boolean(debouncedSearch || status || organizationId)

  return (
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
        <SelectField className="toolbar__filter" label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} options={INVOICE_STATUS_OPTIONS} placeholder="All statuses" />
        <SelectField className="toolbar__filter" label="Organization" value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); setPage(1) }} options={organizationOptions} placeholder="All organizations" />
      </div>

      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data && loading ? (
        <Spinner label="Loading invoices..." />
      ) : items.length === 0 ? (
        <EmptyState icon="file" title="No invoices found" text={filtered ? 'Try changing or clearing the filters.' : 'Create the first invoice for an organization with an active contract.'} />
      ) : (
        <>
          {error && <ErrorState error={error} onRetry={reload} />}
          <div className="table-wrap" aria-busy={loading}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Organization</th>
                  <th>Period</th>
                  <th className="num">Total</th>
                  <th className="num">Balance</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>
                {items.map((invoice) => (
                  <tr key={invoice.invoiceId} className={invoice.status === 'Cancelled' ? 'is-inactive' : ''}>
                    <td>
                      <span className="person__name">{invoice.invoiceNumber || `#${invoice.invoiceId}`}</span>
                    </td>
                    <td>
                      <Link to={`/admin/organizations/${invoice.orgId}`}>{invoice.orgName}</Link>
                    </td>
                    <td className="cell-muted cell-date">
                      {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
                    </td>
                    <td className="num">{formatCurrency(invoice.totalAmount, invoice.currency)}</td>
                    <td className="num">{invoice.status === 'Draft' || invoice.status === 'Cancelled' ? '—' : formatCurrency(invoice.balance, invoice.currency)}</td>
                    <td className="cell-muted cell-date">{invoice.dueDate ? formatDate(invoice.dueDate) : '—'}</td>
                    <td>
                      <WorkflowBadge status={invoice.displayStatus} />
                    </td>
<td>
  <ViewButton to={`/admin/invoices/${invoice.invoiceId}`} label={`View invoice ${invoice.invoiceNumber || invoice.invoiceId}`} />
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
  )
}

function OrganizationStatus() {
  const { data, error, loading, reload } = useFetch((signal) => financeApi.organizations(signal), 'finance-organizations')

  return (
    <section className="card">
      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data && loading ? (
        <Spinner label="Loading payment status..." />
      ) : data.length === 0 ? (
        <EmptyState icon="building" title="Nothing to show yet" text="Issue an invoice and its organization will appear here with what is paid, outstanding and overdue." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th className="num">Invoices</th>
                <th className="num">Invoiced</th>
                <th className="num">Paid</th>
                <th className="num">Outstanding</th>
                <th className="num">Overdue</th>
                <th>Last payment</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={`${row.orgId}-${row.currency}`}>
                  <td>
                    <Link className="person__name" to={`/admin/organizations/${row.orgId}`}>
                      {row.orgName}
                    </Link>
                  </td>
                  <td className="num">{row.invoiceCount}</td>
                  <td className="num">{formatCurrency(row.invoiced, row.currency)}</td>
                  <td className="num">{formatCurrency(row.paid, row.currency)}</td>
                  <td className="num">{formatCurrency(row.outstanding, row.currency)}</td>
                  <td className="num">{row.overdue > 0 ? <strong style={{ color: 'var(--danger)' }}>{formatCurrency(row.overdue, row.currency)}</strong> : '—'}</td>
                  <td className="cell-muted cell-date">{row.lastPaymentAt ? formatDateTime(row.lastPaymentAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default InvoicesPage
