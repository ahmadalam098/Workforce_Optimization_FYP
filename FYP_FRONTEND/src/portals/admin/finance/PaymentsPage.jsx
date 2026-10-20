import { useState } from 'react'
import { Link } from 'react-router-dom'
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
import { billingMailApi, organizationsApi, paymentsLedgerApi } from '../../../services/admin/adminService.js'
import { downloadCsv } from '../../../utils/csv.js'
import { formatCurrency, formatCurrencyWhole, formatDate } from '../../../utils/format.js'
import Notice from '../shared/Notice.jsx'
import PageHeader from '../shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'
import './FinanceTiles.css'

const PAGE_SIZE = 15
const METHODS = ['Bank transfer', 'Cash', 'Cheque', 'Online payment', 'Other'].map((value) => ({ value, label: value }))
const CHECKED = [
  { value: 'true', label: 'Verified by the manager' },
  { value: 'false', label: 'Not verified' },
]

/** Admin: every payment received - the ledger. Filter it, see the totals, open a receipt, email a receipt, and export the rows to Excel (CSV). */
function PaymentsPage() {
  const [search, setSearch] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [method, setMethod] = useState('')
  const [verified, setVerified] = useState('')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useFlashNotice()

  const debounced = useDebouncedValue(search)
  const filters = { search: debounced.trim(), organizationId, from, to, method, verified }
  const params = { ...filters, page, pageSize: PAGE_SIZE }
  const { data, error, loading, reload } = useFetch((signal) => paymentsLedgerApi.list(params, signal), JSON.stringify(params))
  const { data: organizations } = useFetch((signal) => organizationsApi.lookup(signal), 'admin-org-lookup')
  const items = data?.items ?? []
  const organizationOptions = (organizations ?? []).map((org) => ({ value: String(org.organizationId), label: org.name }))
  const anyFilter = Boolean(debounced || organizationId || from || to || method || verified)

  const change = (setter) => (event) => {
    setter(event.target.value)
    setPage(1)
  }

  async function exportCsv() {
    setExporting(true)
    try {
      const rows = await paymentsLedgerApi.exportAll(filters)
      downloadCsv(
        `payments-${new Date().toISOString().slice(0, 10)}.csv`,
        ['Receipt', 'Date', 'Organization', 'Invoice', 'Amount', 'Currency', 'Rate to PKR', 'Amount in PKR', 'Method', 'Reference', 'Recorded by', 'Verified by'],
        rows.map((row) => [row.receiptNumber, formatDate(row.paidAt), row.orgName, row.invoiceNumber, row.amount, row.currency, row.currency === 'PKR' ? '' : row.exchangeRate, row.amountPkr, row.method ?? '', row.reference ?? '', row.recordedBy ?? '', row.verifiedBy ?? '']),
      )
    } catch (problem) {
      setNotice(problem.message)
    } finally {
      setExporting(false)
    }
  }

  async function emailReceipt(row) {
    try {
      const result = await billingMailApi.receipt(row.paymentId)
      setNotice(result?.message || 'Done.')
    } catch (problem) {
      setNotice(problem.message)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Payments"
        description="Every payment received from the organizations, with its receipt."
        actions={
          <Button variant="secondary" onClick={exportCsv} loading={exporting} disabled={!data || data.total === 0}>
            <Icon name="file" size={17} /> Export CSV
          </Button>
        }
      />
      <Notice message={notice} onClose={() => setNotice('')} />

      {data && data.totals.length > 0 && (
        <section className="finance-tiles" aria-label="Totals">
          {data.totals.map((row) => (
            <article className="card finance-tile" key={row.currency}>
              <p className="finance-tile__label">Received ({row.currency})</p>
              <p className="finance-tile__value">{formatCurrencyWhole(row.amount, row.currency)}</p>
              <p className="finance-tile__caption">
                {row.count} payment{row.count === 1 ? '' : 's'}
                {row.currency !== 'PKR' && ` · ${formatCurrencyWhole(row.amountPkr, 'PKR')}`}
              </p>
            </article>
          ))}
        </section>
      )}

      <section className="card">
        <div className="toolbar">
          <TextField className="toolbar__search" label="Search payments" icon="search" placeholder="Reference, invoice number or organization" value={search} onChange={change(setSearch)} />
          <SelectField className="toolbar__filter" label="Organization" value={organizationId} onChange={change(setOrganizationId)} options={organizationOptions} placeholder="All organizations" />
          <SelectField className="toolbar__filter" label="Method" value={method} onChange={change(setMethod)} options={METHODS} placeholder="All methods" />
          <SelectField className="toolbar__filter" label="Manager check" value={verified} onChange={change(setVerified)} options={CHECKED} placeholder="All" />
          <TextField className="toolbar__filter" label="From" type="date" value={from} onChange={change(setFrom)} />
          <TextField className="toolbar__filter" label="To" type="date" value={to} onChange={change(setTo)} />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading payments..." />
        ) : items.length === 0 ? (
          <EmptyState icon="file" title="No payments found" text={anyFilter ? 'Try changing or clearing the filters.' : 'Payments appear here when they are recorded on an invoice.'} />
        ) : (
          <>
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Received</th>
                    <th>Organization</th>
                    <th className="num">Amount</th>
                    <th className="num">In PKR</th>
                    <th>Method</th>
                    <th>Manager check</th>
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.paymentId}>
                      <td>
                        <Link to={`/admin/documents/receipt/${row.paymentId}`}>
                          <strong>{row.receiptNumber}</strong>
                        </Link>
                        <Link className="person__sub" to={`/admin/invoices/${row.invoiceId}`}>
                          {row.invoiceNumber}
                        </Link>
                      </td>
                      <td className="cell-muted cell-date">{formatDate(row.paidAt)}</td>
                      <td>{row.orgName}</td>
                      <td className="num">{formatCurrency(row.amount, row.currency)}</td>
                      <td className="num">{formatCurrency(row.amountPkr, 'PKR')}</td>
                      <td>
                        {row.method || '—'}
                        {row.reference && <span className="person__sub">{row.reference}</span>}
                      </td>
                      <td>{row.verifiedAt ? <Badge tone="success">Verified</Badge> : <span className="cell-muted">Not yet</span>}</td>
                      <td>
                        <div className="row-actions">
                          <Button variant="secondary" onClick={() => emailReceipt(row)}>
                            Email receipt
                          </Button>
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
    </div>
  )
}

export default PaymentsPage
