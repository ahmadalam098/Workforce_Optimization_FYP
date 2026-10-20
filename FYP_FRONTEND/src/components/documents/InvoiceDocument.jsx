import { formatCurrency } from '../../utils/format.js'
import { Facts, Foot, Head, Party, Qr, Stamp } from './DocumentParts.jsx'
import { day } from './documentFormat.js'

const STAMPS = { Paid: ['Paid', 'success'], Overdue: ['Overdue', 'danger'], Cancelled: ['Cancelled', 'neutral'], Draft: ['Draft', 'neutral'], PartiallyPaid: ['Part paid', 'neutral'] }

/** The invoice: what the organization is billed, line by line, with the payments received and how to pay. `layout` is 'a4' or 'slip' (narrow thermal roll). */
function InvoiceDocument({ doc, layout }) {
  const slip = layout === 'slip'
  const stamp = STAMPS[doc.displayStatus]
  const currency = doc.currency

  return (
    <div className={`doc-sheet ${slip ? 'doc-sheet--slip' : ''}`}>
      <Head letterhead={doc.letterhead} title={doc.title} number={doc.number} />
      {stamp && <Stamp text={stamp[0]} tone={stamp[1]} />}

      <div className="doc-grid">
        <Party title="Billed to" organization={doc.organization} />
        <Facts
          rows={[
            ['Invoice date', day(doc.issueDate)],
            ['Due date', day(doc.dueDate)],
            ['Period', `${day(doc.periodStart)} – ${day(doc.periodEnd)}`],
            ['Contract', doc.contractNumber],
            ['Prepared by', doc.issuedBy],
          ]}
        />
      </div>

      <table className="doc-table">
        <thead>
          <tr>
            <th>Description</th>
            <th className="num">{slip ? 'Hrs × Rate' : 'Employee-hours'}</th>
            {!slip && <th className="num">Rate</th>}
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((line) => (
            <tr key={line.lineId}>
              <td>{line.description}</td>
              <td className="num">{slip ? `${line.quantity} × ${line.unitRate}` : line.quantity}</td>
              {!slip && <td className="num">{formatCurrency(line.unitRate, currency)}</td>}
              <td className="num">{formatCurrency(line.amount, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="doc-totals">
        <div>
          <span>Total</span>
          <span>{formatCurrency(doc.total, currency)}</span>
        </div>
        <div>
          <span>Paid</span>
          <span>{formatCurrency(doc.paid, currency)}</span>
        </div>
        <div className="is-total">
          <span>Balance due</span>
          <span>{formatCurrency(doc.balance, currency)}</span>
        </div>
      </div>

      <p className="doc-words">{doc.amountInWords}</p>

      {doc.payments.length > 0 && (
        <>
          <p className="doc-section-title">Payments received</p>
          <table className="doc-table">
            <tbody>
              {doc.payments.map((payment) => (
                <tr key={payment.paymentId}>
                  <td>{day(payment.paidAt)}</td>
                  <td>{payment.receiptNumber}</td>
                  <td>{payment.method}</td>
                  <td className="num">{formatCurrency(payment.amount, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {doc.cancelReason && <p className="doc-note">Cancelled: {doc.cancelReason}</p>}
      {doc.notes && <p className="doc-note">{doc.notes}</p>}
      {doc.letterhead.bankDetails && doc.balance > 0 && (
        <div className="doc-pay">
          <p className="doc-label">How to pay</p>
          {doc.letterhead.bankDetails}
        </div>
      )}
      {doc.letterhead.terms && <p className="doc-note">{doc.letterhead.terms}</p>}

      <div className="doc-bottom">
        <Qr verify={doc.verify} />
        <Foot letterhead={doc.letterhead} />
      </div>
    </div>
  )
}

export default InvoiceDocument
