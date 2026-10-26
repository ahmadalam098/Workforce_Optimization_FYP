import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import LinkButton from '../../../components/ui/LinkButton.jsx'
import { billingMailApi, invoicesApi } from '../../../services/admin/adminService.js'
import { formatCurrency, formatDate, formatDateTime } from '../../../utils/format.js'
import DecisionModal from '../shared/DecisionModal.jsx'
import Notice from '../shared/Notice.jsx'
import RecordPaymentModal from './RecordPaymentModal.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'
import WorkflowBadge from '../shared/WorkflowBadge.jsx'
import './FinanceTiles.css'

function InvoiceDetailsPage() {
  const { invoiceId } = useParams()
  const location = useLocation()
  const [notice, setNotice] = useState(location.state?.message ?? '')
  const [paying, setPaying] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [sendingBack, setSendingBack] = useState(false)
  const [cancelling, setCancelling] = useState(false)

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

  async function handleVerify() {
    const result = await invoicesApi.verify(invoice.invoiceId)
    setVerifying(false)
    done(result?.message || 'Invoice verified and issued.')
  }

  async function handleSendBack(reason) {
    await invoicesApi.sendBack(invoice.invoiceId, reason)
    setSendingBack(false)
    done('Sent back to the organization manager.')
  }

  async function handleCancel(reason) {
    await invoicesApi.cancel(invoice.invoiceId, reason)
    setCancelling(false)
    done('Invoice cancelled.')
  }

  async function sendMail(kind) {
    try {
      const result = await (kind === 'reminder' ? billingMailApi.reminder(invoice.invoiceId) : billingMailApi.invoice(invoice.invoiceId))
      setNotice(result?.message || 'Done.')
    } catch (problem) {
      setNotice(problem.message)
    }
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
            {invoice.verifiedAt && <Badge tone="success" dot>Verified by {invoice.verifiedBy || 'the admin'} · {formatDate(invoice.verifiedAt)}</Badge>}
            {isDraft && invoice.preparedBy && <span className="cell-muted">Prepared by {invoice.preparedBy}{invoice.submittedAt && ` · sent ${formatDateTime(invoice.submittedAt)}`}</span>}
            {invoice.issueDate && <span className="cell-muted">Issued {formatDate(invoice.issueDate)}</span>}
            {invoice.dueDate && <span className="cell-muted">· due {formatDate(invoice.dueDate)}</span>}
          </div>
        </div>
        <div className="hero-card__actions">
          <LinkButton to={`/admin/documents/invoice/${invoice.invoiceId}`}>
            <Icon name="file" size={17} /> Print / View
          </LinkButton>
          {!isDraft && invoice.status !== 'Cancelled' && (
            <Button variant="secondary" onClick={() => sendMail('invoice')}>
              Email invoice
            </Button>
          )}
          {isIssued && invoice.balance > 0 && (
            <Button variant="secondary" onClick={() => sendMail('reminder')}>
              Send reminder
            </Button>
          )}
          {isDraft && (
            <Button onClick={() => setVerifying(true)}>
              <Icon name="checkCircle" size={17} /> Verify and issue
            </Button>
          )}
          {isDraft && (
            <Button variant="secondary" onClick={() => setSendingBack(true)}>
              <Icon name="arrowLeft" size={17} /> Send back
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

      {isDraft && (
        <section className="card">
          <div className="card__body">
            <p className="term-group__title">Waiting for your verification</p>
            <p>
              The organization manager{invoice.preparedBy ? ` (${invoice.preparedBy})` : ''} prepared this invoice from the contract rates and the allocated hours. Check the lines below. Verify it to issue it to {invoice.orgName}, or send it back to the manager
              with what to fix.
            </p>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Lines</h3>
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
                  <th>Manager check</th>
                  <th>Receipt</th>
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
                    <td>{payment.verifiedAt ? <Badge tone="success">Verified</Badge> : <span className="cell-muted">Not yet</span>}</td>
                    <td>
                      <Link to={`/admin/documents/receipt/${payment.paymentId}`}>Receipt</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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

      {verifying && (
        <ConfirmDialog
          title="Verify and issue invoice?"
          message={`You confirm that you checked ${invoice.invoiceNumber} for ${formatCurrency(invoice.totalAmount, currency)}. It is issued to ${invoice.orgName} at once, its lines can no longer be changed, and the due date is set from the payment rules.`}
          confirmLabel="Verify and issue"
          onConfirm={handleVerify}
          onCancel={() => setVerifying(false)}
        />
      )}

      {sendingBack && (
        <DecisionModal
          title="Send back to the manager?"
          description="The organization manager sees your reason, fixes the invoice and sends it again."
          label="What should be fixed?"
          required
          confirmLabel="Send back"
          onSubmit={handleSendBack}
          onClose={() => setSendingBack(false)}
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
