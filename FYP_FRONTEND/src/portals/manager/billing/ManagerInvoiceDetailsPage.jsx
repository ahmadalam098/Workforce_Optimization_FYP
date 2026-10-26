import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../../../components/ui/Button.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import LinkButton from '../../../components/ui/LinkButton.jsx'
import { managerBillingApi } from '../../../services/manager/managerService.js'
import { formatCurrency, formatDate, formatDateTime } from '../../../utils/format.js'
import '../../admin/finance/FinanceTiles.css'
import DecisionModal from '../../admin/shared/DecisionModal.jsx'
import Notice from '../../admin/shared/Notice.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import WorkflowBadge from '../../admin/shared/WorkflowBadge.jsx'
import AdjustmentLineModal from './AdjustmentLineModal.jsx'
import { VerifiedBadge } from './ManagerInvoicesPage.jsx'

/** Organization Manager: one invoice. A draft is prepared here (recalculate, adjustment lines) and sent to the admin; each payment can be verified. */
function ManagerInvoiceDetailsPage() {
  const { invoiceId } = useParams()
  const [notice, setNotice] = useFlashNotice()
  const [adding, setAdding] = useState(false)
  const [lineToDelete, setLineToDelete] = useState(null)
  const [recalculating, setRecalculating] = useState(false)
  const [sending, setSending] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [verifyPayment, setVerifyPayment] = useState(null)
  const { data: invoice, error, loading, reload } = useFetch((signal) => managerBillingApi.invoice(invoiceId, signal), `manager-invoice-${invoiceId}`)

  const back = (
    <Link className="back-link" to="/manager/invoices">
      <Icon name="arrowLeft" size={16} /> Back to Invoices
    </Link>
  )

  if (!invoice && loading) return <Spinner label="Loading invoice..." />
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

  function done(message) {
    setNotice(message)
    reload()
  }

  return (
    <div className="page">
      {back}
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card hero-card">
        <div className="hero-card__main">
          <h2 className="hero-card__title">{invoice.invoiceNumber || `Invoice #${invoice.invoiceId}`}</h2>
          <p className="hero-card__sub">
            {invoice.orgName} · {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
            {invoice.contractNumber && <> · contract {invoice.contractNumber}</>}
          </p>
          <div className="hero-card__badges">
            <WorkflowBadge status={invoice.displayStatus} />
            {invoice.verifiedAt && (
              <Badge tone="success" dot>
                Verified by {invoice.verifiedBy || 'the admin'} · {formatDate(invoice.verifiedAt)}
              </Badge>
            )}
            {invoice.issueDate && <span className="cell-muted">Issued {formatDate(invoice.issueDate)}</span>}
            {invoice.dueDate && <span className="cell-muted">· due {formatDate(invoice.dueDate)}</span>}
          </div>
        </div>
        <div className="hero-card__actions">
          <LinkButton to={`/manager/documents/invoice/${invoice.invoiceId}`}>
            <Icon name="file" size={17} /> Print / View
          </LinkButton>
          {invoice.status === 'Issued' && invoice.balance > 0 && (
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  const result = await managerBillingApi.reminder(invoice.invoiceId)
                  setNotice(result?.message || 'Reminder sent.')
                } catch (problem) {
                  setNotice(problem.message)
                }
              }}
            >
              Remind the organization
            </Button>
          )}
          {invoice.canEdit && (
            <Button onClick={() => setSending(true)}>
              <Icon name="send" size={17} /> Send to the admin
            </Button>
          )}
          {invoice.canEdit && (
            <Button variant="secondary" onClick={() => setDiscarding(true)}>
              <Icon name="ban" size={17} /> Discard draft
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

      {invoice.returnedReason && invoice.canEdit && (
        <section className="card">
          <div className="card__body">
            <p className="term-group__title">The admin sent this invoice back</p>
            <p>{invoice.returnedReason}</p>
          </div>
        </section>
      )}

      {invoice.canEdit && (
        <section className="card">
          <div className="card__body">
            <p className="term-group__title">Draft: you are preparing it</p>
            <p>The lines come from the contract rates and the hours your employees worked for {invoice.orgName}. Recalculate if allocations changed, add an adjustment (a discount, a minimum guarantee ...), then send it to the admin. The organization sees it only after the admin verifies it.</p>
          </div>
        </section>
      )}

      {invoice.waitingForAdmin && (
        <section className="card">
          <div className="card__body">
            <p className="term-group__title">Waiting for the admin</p>
            <p>You sent this invoice on {formatDateTime(invoice.submittedAt)}. The admin verifies it, which issues it to the organization, or sends it back to you with what to fix. You cannot change it meanwhile.</p>
          </div>
        </section>
      )}

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
          {invoice.canEdit && (
            <div className="page-header__actions">
              <Button variant="secondary" onClick={() => setRecalculating(true)}>
                <Icon name="refresh" size={16} /> Recalculate
              </Button>
              <Button variant="secondary" onClick={() => setAdding(true)}>
                <Icon name="plus" size={16} /> Add adjustment
              </Button>
            </div>
          )}
        </div>
        {invoice.lines.length === 0 ? (
          <EmptyState icon="file" title="No lines" text="This invoice has no billable lines." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Quantity</th>
                  <th className="num">Rate</th>
                  <th className="num">Amount</th>
                  {invoice.canEdit && (
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
                    {invoice.canEdit && (
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
                  {invoice.canEdit && <td />}
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
                  <th>Method</th>
                  <th>Verification</th>
                  <th>Receipt</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
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
                    <td>
                      <VerifiedBadge verifiedAt={payment.verifiedAt} verifiedBy={payment.verifiedBy} />
                    </td>
                    <td>
                      <Link to={`/manager/documents/receipt/${payment.paymentId}`}>Receipt</Link>
                    </td>
                    <td>
                      <div className="row-actions">
                        {!payment.verifiedAt && (
                          <Button variant="secondary" onClick={() => setVerifyPayment(payment)}>
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
        )}
      </section>

      {adding && (
        <AdjustmentLineModal
          invoice={invoice}
          onClose={() => setAdding(false)}
          onSaved={(message) => {
            setAdding(false)
            done(message)
          }}
        />
      )}

      {recalculating && (
        <ConfirmDialog
          title="Recalculate from allocations?"
          message="The generated lines are rebuilt from the latest allocations and contract rates. Your adjustment lines are kept."
          confirmLabel="Recalculate"
          onConfirm={async () => {
            const result = await managerBillingApi.recalculateInvoice(invoice.invoiceId)
            setRecalculating(false)
            done(result?.message || 'Invoice recalculated.')
          }}
          onCancel={() => setRecalculating(false)}
        />
      )}

      {lineToDelete && (
        <ConfirmDialog
          title="Remove line?"
          message={`"${lineToDelete.description}" will be removed from this draft.`}
          confirmLabel="Remove"
          danger
          onConfirm={async () => {
            await managerBillingApi.deleteInvoiceLine(invoice.invoiceId, lineToDelete.lineId)
            setLineToDelete(null)
            done('Line removed.')
          }}
          onCancel={() => setLineToDelete(null)}
        />
      )}

      {sending && (
        <ConfirmDialog
          title="Send to the admin?"
          message={`${invoice.invoiceNumber} for ${formatCurrency(invoice.totalAmount, currency)} goes to the admin for verification. You cannot change it after sending, unless the admin sends it back.`}
          confirmLabel="Send to the admin"
          onConfirm={async () => {
            const result = await managerBillingApi.submitInvoice(invoice.invoiceId)
            setSending(false)
            done(result?.message || 'Sent to the admin.')
          }}
          onCancel={() => setSending(false)}
        />
      )}

      {discarding && (
        <DecisionModal
          title="Discard this draft?"
          description="The draft is cancelled and never reaches the admin or the organization. The reason is kept."
          label="Reason"
          required
          danger
          confirmLabel="Discard draft"
          onSubmit={async (reason) => {
            await managerBillingApi.discardInvoice(invoice.invoiceId, reason)
            setDiscarding(false)
            done('Draft discarded.')
          }}
          onClose={() => setDiscarding(false)}
        />
      )}

      {verifyPayment && (
        <ConfirmDialog
          title="Verify payment?"
          message={`You confirm that the payment of ${formatCurrency(verifyPayment.amount, verifyPayment.currency)} on ${formatDateTime(verifyPayment.paidAt)} was made.`}
          confirmLabel="Verify"
          onConfirm={async () => {
            const result = await managerBillingApi.verifyPayment(verifyPayment.paymentId)
            setVerifyPayment(null)
            done(result?.message || 'Payment verified.')
          }}
          onCancel={() => setVerifyPayment(null)}
        />
      )}
    </div>
  )
}

export default ManagerInvoiceDetailsPage
