import { useState } from 'react'
import { Link } from 'react-router-dom'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import LinkButton from '../../../components/ui/LinkButton.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { onlinePaymentsApi, organizationsApi } from '../../../services/admin/adminService.js'
import { formatCurrency, formatCurrencyWhole, formatDateTime } from '../../../utils/format.js'
import Notice from '../shared/Notice.jsx'
import PageHeader from '../shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'
import './FinanceTiles.css'

const STATUSES = ['Paid', 'Created', 'Failed', 'Cancelled', 'Expired'].map((value) => ({ value, label: value === 'Created' ? 'Waiting for the gateway' : value }))
const TONES = { Paid: 'success', Created: 'warning', Failed: 'danger', Cancelled: 'neutral', Expired: 'neutral' }

/**
 * Admin: every online payment the organizations made through the payment gateway (Safepay): which organization paid, for which invoice, how
 * much, Safepay's tracker and how it ended. A paid one is already recorded on the invoice (with its receipt). One that is still waiting can be
 * checked with Safepay now - useful when Safepay's webhook could not reach the server.
 */
function OnlinePaymentsPage() {
  const [status, setStatus] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [checking, setChecking] = useState('')
  const [notice, setNotice] = useFlashNotice()
  const params = { status, organizationId }
  const { data, error, loading, reload } = useFetch((signal) => onlinePaymentsApi.list(params, signal), JSON.stringify(params))
  const { data: organizations } = useFetch((signal) => organizationsApi.lookup(signal), 'admin-org-lookup')
  const items = data?.items ?? []
  const organizationOptions = (organizations ?? []).map((org) => ({ value: String(org.organizationId), label: org.name }))

  async function check(row) {
    setChecking(row.token)
    try {
      const result = await onlinePaymentsApi.check(row.token)
      setNotice(`${row.organization} · ${row.invoiceNumber}: ${result.message}`)
      reload()
    } catch (problem) {
      setNotice(problem.message)
    } finally {
      setChecking('')
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Online Payments"
        description={`Payments the organizations made online${data ? ` through ${data.gateway}${data.demo ? ' (demo gateway - no real money)' : ''}` : ''}. A paid one is already on the invoice, with its receipt.`}
      />
      <Notice message={notice} onClose={() => setNotice('')} />

      {data && data.received.length > 0 && (
        <section className="finance-tiles" aria-label="Received online">
          {data.received.map((row) => (
            <article className="card finance-tile" key={row.currency}>
              <p className="finance-tile__label">Received online ({row.currency})</p>
              <p className="finance-tile__value">{formatCurrencyWhole(row.amount, row.currency)}</p>
              <p className="finance-tile__caption">
                {row.count} payment{row.count === 1 ? '' : 's'}
              </p>
            </article>
          ))}
        </section>
      )}

      <section className="card">
        <div className="toolbar">
          <SelectField className="toolbar__filter" label="Organization" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} options={organizationOptions} placeholder="All organizations" />
          <SelectField className="toolbar__filter" label="Status" value={status} onChange={(event) => setStatus(event.target.value)} options={STATUSES} placeholder="All" />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading online payments..." />
        ) : items.length === 0 ? (
          <EmptyState icon="file" title="No online payments" text={status || organizationId ? 'Try changing the filters.' : 'When an organization pays an invoice online, it appears here.'} />
        ) : (
          <div className="table-wrap" aria-busy={loading}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Organization</th>
                  <th>Invoice</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th>Gateway reference</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.onlinePaymentId}>
                    <td className="cell-muted cell-date">
                      {formatDateTime(row.createdAt)}
                      {row.completedAt && <span className="person__sub">ended {formatDateTime(row.completedAt)}</span>}
                    </td>
                    <td>{row.organization}</td>
                    <td>
                      <Link to={`/admin/invoices/${row.invoiceId}`}>{row.invoiceNumber}</Link>
                    </td>
                    <td className="num">{formatCurrency(row.amount, row.currency)}</td>
                    <td>
                      <Badge tone={TONES[row.status] ?? 'neutral'} dot>
                        {row.status === 'Created' ? 'Waiting' : row.status}
                      </Badge>
                      {row.failureReason && row.status !== 'Paid' && <span className="person__sub">{row.failureReason}</span>}
                    </td>
                    <td>
                      <span className="cell-muted">{row.provider}</span>
                      {row.gatewayReference && <span className="person__sub">{row.gatewayReference}</span>}
                    </td>
                    <td>
                      <div className="row-actions">
                        {row.paymentId && (
                          <LinkButton to={`/admin/documents/receipt/${row.paymentId}`}>Receipt</LinkButton>
                        )}
                        {row.status === 'Created' && row.provider !== 'Demo' && (
                          <Button variant="secondary" onClick={() => check(row)} loading={checking === row.token}>
                            Check with {row.provider}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default OnlinePaymentsPage
