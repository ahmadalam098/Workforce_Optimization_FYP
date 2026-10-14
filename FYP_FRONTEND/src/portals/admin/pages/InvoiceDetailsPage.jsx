import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import Button from '../../../components/ui/Button.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { invoicesApi } from '../../../services/adminService.js'
import { formatCurrency, formatDate, formatDateTime } from '../../../utils/format.js'
import AdjustmentLineModal from '../components/AdjustmentLineModal.jsx'
import DecisionModal from '../components/DecisionModal.jsx'
import Notice from '../components/Notice.jsx'
import RecordPaymentModal from '../components/RecordPaymentModal.jsx'
import { EmptyState, ErrorState } from '../components/StateBox.jsx'
import WorkflowBadge from '../components/WorkflowBadge.jsx'
import './FinanceTiles.css'

function InvoiceDetailsPage() {
  const { invoiceId } = useParams()
  const location = useLocation()
  const [notice, setNotice] = useState(location.state?.message ?? '')
  const [addingLine, setAddingLine] = useState(false)
  const [paying, setPaying] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [lineToDelete, setLineToDelete] = useState(null)
  const [recalculating, setRecalculating] = useState(false)

  const { data: invoice, error, loading, reload } = useFetch((signal) => invoicesApi.get(invoiceId, signal), `invoice-${invoiceId}`)

  const back = (
    <Link className="back-link" to="/admin/invoices">
      <Icon name="arrowLeft" size={16} /> Back to Invoices
    </Link>
  )

  if (!invoice && loading) {
    return (
      <div className="page">
        {back}
        <Spinner label="Loading invoice..." />
      </div>
    )
  }

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

  const isDraft = invoice.status === 'Draft'
  const isIssued = invoice.status === 'Issued'
  const currency = invoice.currency

  function done(message) {
    setNotice(message)
    reload()
  }

  async function handleIssue() {
    const result = await invoicesApi.issue(invoice.invoiceId)
    setIssuing(false)
    done(result?.message || 'Invoice issued.')
  }

  async function handleCancel(reason) {
    await invoicesApi.cancel(invoice.invoiceId, reason)
    setCancelling(false)
    done('Invoice cancelled.')
  }

  async function handleDeleteLine() {
    await invoicesApi.deleteLine(invoice.invoiceId, lineToDelete.lineId)
    setLineToDelete(null)
    done('Line removed.')
  }

  async function handleRecalculate() {
    const result = await invoicesApi.recalculate(invoice.invoiceId)
    setRecalculating(false)
    done(result?.message || 'Invoice recalculated.')
  }

  return (
    <div className="page">
      {back}
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card hero-card">
        <div className="hero-card__main">
          <h2 className="hero-card__title">{invoice.invoiceNumber || `Invoice #${invoice.invoiceId}`}</h2>
          <p className="hero-card__sub">
            <Link to={`/admin/organizations/${invoice.orgId}`}>{invoice.orgName}</Link> · {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
            {invoice.contractNumber && (
              <>
                {' '}
                · contract <Link to={`/admin/contracts/${invoice.contractId}`}>{invoice.contractNumber}</Link>
              </>
            )}
          </p>
          <div className="hero-card__badges">
            <WorkflowBadge status={invoice.displayStatus} />
            {invoice.issueDate && <span className="cell-muted">Issued {formatDate(invoice.issueDate)}</span>}
            {invoice.dueDate && <span className="cell-muted">· due {formatDate(invoice.dueDate)}</span>}
          </div>
        </div>
        <div className="hero-card__actions">
          {isDraft && (
            <Button onClick={() => setIssuing(true)}>
              <Icon name="checkCircle" size={17} /> Issue invoice
            </Button>
          )}
          {isIssued && (
            <Button onClick={() => setPaying(true)}>
              <Icon name="plus" size={17} /> Record payment
            </Button>
          )}
          {(isDraft || (isIssued && invoice.paidAmount === 0)) && (
            <Button variant="secondary" onClick={() => setCancelling(true)}>
              <Icon name="ban" size={17} /> Cancel
            </Button>
          )}
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

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Lines</h3>
          {isDraft && (
            <div className="page-header__actions">
              <Button variant="secondary" onClick={() => setRecalculating(true)}>
                <Icon name="refresh" size={16} /> Recalculate
              </Button>
              <Button variant="secondary" onClick={() => setAddingLine(true)}>
                <Icon name="plus" size={16} /> Add adjustment
              </Button>
            </div>
          )}
        </div>
        {invoice.lines.length === 0 ? (
          <EmptyState icon="file" title="No lines" text="This invoice has no billable hours. Add an adjustment line (for example a minimum guarantee) or recalculate once employees are allocated." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Quantity</th>
                  <th className="num">Rate</th>
                  <th className="num">Amount</th>
                  {isDraft && (
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  )}
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
                    {isDraft && (
                      <td>
                        <div className="row-actions">
                          {line.lineType === 'Adjustment' && (
                            <button type="button" className="icon-btn icon-btn--danger" onClick={() => setLineToDelete(line)} aria-label={`Remove ${line.description}`} title="Remove">
                              <Icon name="close" size={17} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
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
                  {isDraft && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Payments</h3>
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
                  <th className="num">Rate to PKR</th>
                  <th className="num">In PKR</th>
                  <th>Method</th>
                  <th>Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments.map((payment) => (
                  <tr key={payment.paymentId}>
                    <td className="cell-muted cell-date">{formatDateTime(payment.paidAt)}</td>
                    <td className="num">{formatCurrency(payment.amount, payment.currency)}</td>
                    <td className="num">{payment.currency === 'PKR' ? '—' : payment.exchangeRate}</td>
                    <td className="num">{formatCurrency(payment.amountPkr, 'PKR')}</td>
                    <td>
                      {payment.method || '—'}
                      {payment.reference && <span className="person__sub">{payment.reference}</span>}
                    </td>
                    <td className="cell-muted">{payment.recordedBy || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {addingLine && (
        <AdjustmentLineModal
          invoice={invoice}
          onClose={() => setAddingLine(false)}
          onSaved={(message) => {
            setAddingLine(false)
            done(message)
          }}
        />
      )}

      {paying && (
        <RecordPaymentModal
          invoice={invoice}
          onClose={() => setPaying(false)}
          onSaved={(message) => {
            setPaying(false)
            done(message)
          }}
        />
      )}

      {issuing && (
        <ConfirmDialog
          title="Issue invoice?"
          message={`${invoice.invoiceNumber} for ${formatCurrency(invoice.totalAmount, currency)} will be issued to ${invoice.orgName}. Its lines can no longer be changed, and the due date is set from the payment rules.`}
          confirmLabel="Issue invoice"
          onConfirm={handleIssue}
          onCancel={() => setIssuing(false)}
        />
      )}

      {recalculating && (
        <ConfirmDialog
          title="Recalculate from allocations?"
          message="The generated lines are rebuilt from the latest allocations and contract rates. Your adjustment lines are kept."
          confirmLabel="Recalculate"
          onConfirm={handleRecalculate}
          onCancel={() => setRecalculating(false)}
        />
      )}

      {lineToDelete && (
        <ConfirmDialog
          title="Remove line?"
          message={`"${lineToDelete.description}" will be removed from this draft.`}
          confirmLabel="Remove"
          danger
          onConfirm={handleDeleteLine}
          onCancel={() => setLineToDelete(null)}
        />
      )}

      {cancelling && (
        <DecisionModal
          title="Cancel invoice?"
          description="A cancelled invoice can no longer be paid. The reason is kept."
          label="Reason"
          required
          confirmLabel="Cancel invoice"
          danger
          onSubmit={handleCancel}
          onClose={() => setCancelling(false)}
        />
      )}
    </div>
  )
}

export default InvoiceDetailsPage
