import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import SubmissionsTable from '../../../components/payments/SubmissionsTable.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { organizationPaymentsApi } from '../../../services/organization/organizationService.js'
import { formatCurrency, formatCurrencyWhole, formatDate } from '../../../utils/format.js'
import PayOnlineModal from './PayOnlineModal.jsx'
import '../../admin/finance/FinanceTiles.css'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { ErrorState } from '../../admin/shared/StateBox.jsx'

/** Organization: pay each invoice online in full (Safepay), see the result and the receipt. Older payment notices are still listed. */
function OrganizationPaymentsPage() {
  const [payingOnline, setPayingOnline] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [notice, setNotice] = useFlashNotice()
  const [problem, setProblem] = useState('')
  const { data: payable, reload: reloadPayable } = useFetch((signal) => organizationPaymentsApi.payable(signal), 'organization-payable')
  const { data, error, reload } = useFetch((signal) => organizationPaymentsApi.submissions(signal), 'organization-submissions')
  const { data: options } = useFetch((signal) => organizationPaymentsApi.onlineOptions(signal), 'organization-online-options')
  const { data: online, reload: reloadOnline } = useFetch((signal) => organizationPaymentsApi.onlineList(signal), 'organization-online-list')
  const rows = data ?? []
  const toPay = payable ?? []

  // The gateway sent the organization back: say how it went (and show the receipt).
  const backToken = searchParams.get('token')
  const backOutcome = searchParams.get('online')
  useEffect(() => {
    if (!backToken || !backOutcome) return
    let cancelled = false
    organizationPaymentsApi
      .onlineStatus(backToken)
      .then((status) => {
        if (cancelled) return
        setNotice(
          status.status === 'Paid'
            ? `Payment received. Your receipt is ${status.receiptNumber}.`
            : status.status === 'Cancelled'
              ? 'The payment was cancelled. Nothing was charged.'
              : status.status === 'Created'
                ? `${status.provider} has not confirmed the payment yet. It is recorded here as soon as ${status.provider} confirms it - you do not need to pay again.`
                : `The payment did not go through. ${status.failureReason ?? ''} You can try again.`,
        )
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return
        setSearchParams({}, { replace: true })
        reload()
        reloadPayable()
        reloadOnline()
      })
    return () => {
      cancelled = true
    }
  }, [backToken, backOutcome]) // eslint-disable-line react-hooks/exhaustive-deps

  function refresh() {
    reload()
    reloadPayable()
  }

  async function withdraw(row) {
    setProblem('')
    try {
      const result = await organizationPaymentsApi.withdraw(row.submissionId)
      setNotice(result?.message || 'Withdrawn.')
      refresh()
    } catch (err) {
      setProblem(err.message)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Payments"
        description="Pay your invoices online in full. As soon as the payment goes through, the invoice is marked paid and your receipt appears below."
      />
      <Notice message={notice} onClose={() => setNotice('')} />
      {problem && (
        <Alert type="error" onClose={() => setProblem('')}>
          {problem}
        </Alert>
      )}

      {payable && (
        <section className="finance-tiles" aria-label="To pay">
          {toPay.length === 0 ? (
            <article className="card finance-tile">
              <p className="finance-tile__label">To pay</p>
              <p className="finance-tile__value">—</p>
              <p className="finance-tile__caption">Nothing is waiting to be paid</p>
            </article>
          ) : (
            Object.entries(
              toPay.reduce((sums, item) => {
                sums[item.currency] = (sums[item.currency] ?? 0) + item.balance
                return sums
              }, {}),
            ).map(([currency, amount]) => (
              <article className={`card finance-tile ${toPay.some((item) => item.currency === currency && item.overdue) ? 'finance-tile--danger' : ''}`} key={currency}>
                <p className="finance-tile__label">To pay ({currency})</p>
                <p className="finance-tile__value">{formatCurrencyWhole(amount, currency)}</p>
                <p className="finance-tile__caption">
                  {toPay.filter((item) => item.currency === currency).length} invoice(s){toPay.some((item) => item.currency === currency && item.overdue) ? ' · some overdue' : ''}
                </p>
              </article>
            ))
          )}
        </section>
      )}

      {toPay.length > 0 && (
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Invoices to pay</h3>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Due</th>
                  <th className="num">Balance</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {toPay.map((item) => (
                  <tr key={item.invoiceId}>
                    <td>
                      <strong>{item.invoiceNumber}</strong>
                    </td>
                    <td className="cell-muted">
                      {formatDate(item.dueDate)} {item.overdue && <span style={{ color: 'var(--danger-text, #a02a1d)' }}>· overdue</span>}
                    </td>
                    <td className="num">{formatCurrency(item.balance, item.currency)}</td>
                    <td>
                      <div className="row-actions">
                        {options?.enabled ? <Button onClick={() => setPayingOnline(item)}>Pay online</Button> : <span className="cell-muted">Online payment is switched off</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Payment notices sent before online-only payment: shown only while there are some. */}
      {(rows.length > 0 || (error && !data)) && (
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Your payment notices</h3>
          </div>
          {error && !data ? (
            <ErrorState error={error} onRetry={reload} />
          ) : (
            <SubmissionsTable
              rows={rows}
              showOrganization={false}
              invoiceLink={(row) => `/organization/invoices/${row.invoiceId}`}
              receiptLink={(row) => `/organization/documents/receipt/${row.paymentId}`}
              actions={(row) =>
                row.status === 'Pending' ? (
                  <Button variant="secondary" onClick={() => withdraw(row)}>
                    Withdraw
                  </Button>
                ) : null
              }
            />
          )}
        </section>
      )}

      {online && online.length > 0 && (
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Your online payments</h3>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th className="num">Amount</th>
                  <th>When</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {online.map((row) => (
                  <tr key={row.token}>
                    <td>
                      <Link to={`/organization/invoices/${row.invoiceId}`}>{row.invoiceNumber}</Link>
                    </td>
                    <td className="num">{formatCurrency(row.amount, row.currency)}</td>
                    <td className="cell-muted">{formatDate(row.createdAt)}</td>
                    <td>
                      {row.status === 'Paid' ? (
                        <Link to={`/organization/documents/receipt/${row.paymentId}`}>Paid · receipt</Link>
                      ) : row.status === 'Created' ? (
                        <Link to={`/pay/demo/${row.token}`}>Waiting - continue</Link>
                      ) : (
                        <span className="cell-muted">{row.status}{row.failureReason ? ` · ${row.failureReason}` : ''}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {payingOnline && <PayOnlineModal invoice={payingOnline} demo={options?.demo} gateway={options?.gateway} onClose={() => setPayingOnline(null)} />}

    </div>
  )
}

export default OrganizationPaymentsPage
