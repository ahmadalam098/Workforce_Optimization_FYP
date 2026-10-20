import { formatCurrency } from '../../utils/format.js'
import { Facts, Foot, Head, Party, Qr, Stamp } from './DocumentParts.jsx'
import { day } from './documentFormat.js'

/** The receipt of one payment: what was received, how, against which invoice, and what is still to pay. */
function ReceiptDocument({ doc, layout }) {
  const slip = layout === 'slip'
  return (
    <div className={`doc-sheet ${slip ? 'doc-sheet--slip' : ''}`}>
      <Head letterhead={doc.letterhead} title={doc.title} number={doc.number} />
      <Stamp text="Received" tone="success" />

      <div className="doc-grid">
        <Party title="Received from" organization={doc.organization} />
        <Facts
          rows={[
            ['Date', day(doc.paidAt)],
            ['Method', doc.method],
            ['Reference', doc.reference],
            ['Invoice', doc.invoice.number],
            ['Recorded by', doc.receivedBy],
            ['Checked by', doc.verifiedBy],
          ]}
        />
      </div>

      <div className="doc-totals">
        <div className="is-total">
          <span>Amount received</span>
          <span>{formatCurrency(doc.amount, doc.currency)}</span>
        </div>
      </div>
      <p className="doc-words">{doc.amountInWords}</p>

      <table className="doc-table">
        <tbody>
          <tr>
            <td>Invoice total</td>
            <td className="num">{formatCurrency(doc.invoice.total, doc.invoice.currency)}</td>
          </tr>
          <tr>
            <td>Paid so far</td>
            <td className="num">{formatCurrency(doc.invoice.paid, doc.invoice.currency)}</td>
          </tr>
          <tr className="is-strong">
            <td>Still to pay on this invoice</td>
            <td className="num">{formatCurrency(doc.invoice.balance, doc.invoice.currency)}</td>
          </tr>
        </tbody>
      </table>

      {!slip && (
        <div className="doc-sign">
          <span>Received by</span>
          <span>Company stamp</span>
        </div>
      )}

      <div className="doc-bottom">
        <Qr verify={doc.verify} />
        <Foot letterhead={doc.letterhead} />
      </div>
    </div>
  )
}

export default ReceiptDocument
