import { Link, useParams } from 'react-router-dom'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { organizationBillingApi } from '../../../services/organization/organizationService.js'
import { formatCurrency, formatDate, formatDateTime } from '../../../utils/format.js'
import '../../admin/finance/FinanceTiles.css'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import WorkflowBadge from '../../admin/shared/WorkflowBadge.jsx'

/** Organization: one invoice with its lines and the payments received. Read only. */
function OrganizationInvoiceDetailsPage() {
  const { invoiceId } = useParams()
  const { data: invoice, error, loading, reload } = useFetch((signal) => organizationBillingApi.invoice(invoiceId, signal), `organization-invoice-${invoiceId}`)

  const back = (
    <Link className="back-link" to="/organization/invoices">
      <Icon name="arrowLeft" size={16} /> Back to Invoices
    </Link>
  )
  if (!invoice && loading) return <Spinner label="Loading the invoice..." />
  if (!invoice) {
    return (
      <div className="page">
        {back}
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      </div>
    )
  }
  const currency = invoice.currency

  return (
    <div className="page">
      {back}
      <section className="card hero-card">
        <div className="hero-card__main">
          <h2 className="hero-card__title">{invoice.invoiceNumber || `Invoice #${invoice.invoiceId}`}</h2>
          <p className="hero-card__sub">
            {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
            {invoice.contractNumber && <> · contract {invoice.contractNumber}</>}
          </p>
          <div className="hero-card__badges">
            <WorkflowBadge status={invoice.displayStatus} />
            {invoice.issueDate && <span className="cell-muted">Issued {formatDate(invoice.issueDate)}</span>}
            {invoice.dueDate && <span className="cell-muted">· due {formatDate(invoice.dueDate)}</span>}
          </div>
        </div>
      </section>

      <section className="finance-tiles" aria-label="Amounts">
        <article className="card finance-tile">
          <p className="finance-tile__label">Total</p>
          <p className="finance-tile__value">{formatCurrency(invoice.totalAmount, currency)}</p>
        </article>
        <article className="card finance-tile">
          <p className="finance-tile__label">Paid</p>
          <p className="finance-tile__value">{formatCurrency(invoice.paidAmount, currency)}</p>
        </article>
        <article className={`card finance-tile ${invoice.displayStatus === 'Overdue' ? 'finance-tile--danger' : ''}`}>
          <p className="finance-tile__label">Balance</p>
          <p className="finance-tile__value">{formatCurrency(invoice.balance, currency)}</p>
        </article>
      </section>

      {invoice.status === 'Cancelled' && invoice.cancelReason && (
        <section className="card">
          <div className="card__body">
            <p className="term-group__title">Cancelled</p>
            <p>{invoice.cancelReason}</p>
          </div>
        </section>
      )}
      {invoice.notes && (
        <section className="card">
          <div className="card__body">
            <p className="term-group__title">Note</p>
            <p>{invoice.notes}</p>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">What you are billed for</h3>
        </div>
        {invoice.lines.length === 0 ? (
          <EmptyState icon="file" title="No lines" text="This invoice has no billable lines." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Employee-hours</th>
                  <th className="num">Rate</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.lineId}>
                    <td>
                      {line.description} {line.lineType === 'Adjustment' && <span className="chip">Adjustment</span>}
                    </td>
                    <td className="num">{line.quantity}</td>
                    <td className="num">{formatCurrency(line.unitRate, currency)}</td>
                    <td className="num">{formatCurrency(line.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>
                    <strong>Total</strong>
                  </td>
                  <td className="num">
                    <strong>{formatCurrency(invoice.totalAmount, currency)}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Payments received</h3>
        </div>
        {invoice.payments.length === 0 ? (
          <EmptyState icon="clock" title="No payments yet" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Received</th>
                  <th className="num">Amount</th>
                  <th>Method</th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments.map((payment) => (
                  <tr key={payment.paymentId}>
                    <td className="cell-muted cell-date">{formatDateTime(payment.paidAt)}</td>
                    <td className="num">{formatCurrency(payment.amount, payment.currency)}</td>
                    <td>
                      {payment.method || '—'}
                      {payment.reference && <span className="person__sub">{payment.reference}</span>}
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

export default OrganizationInvoiceDetailsPage
