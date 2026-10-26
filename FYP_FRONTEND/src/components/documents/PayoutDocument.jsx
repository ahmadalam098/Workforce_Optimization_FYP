import { formatCurrency } from '../../utils/format.js'
import { Facts, Foot, Head, Qr, Stamp } from './DocumentParts.jsx'
import { day } from './documentFormat.js'

/** The receipt of one profit share the admin sent to a business owner: what came in, what was spent, what was shared, and this owner's part. */
function PayoutDocument({ doc, layout }) {
  const slip = layout === 'slip'
  return (
    <div className={`doc-sheet ${slip ? 'doc-sheet--slip' : ''}`}>
      <Head letterhead={doc.letterhead} title={doc.title} number={doc.number} />
      <Stamp text="Sent" tone="success" />

      <div className="doc-grid">
        <Facts
          rows={[
            ['Paid to', doc.owner.name],
            ['Email', doc.owner.email],
            ['For', doc.period],
            ['Sent on', day(doc.sentAt)],
            ['Sent by', doc.sentBy],
            ['Shared between', `${doc.owners} business owner${doc.owners === 1 ? '' : 's'}, equally`],
          ]}
        />
      </div>

      <div className="doc-totals">
        <div className="is-total">
          <span>Your share</span>
          <span>{formatCurrency(doc.amountPkr, 'PKR')}</span>
        </div>
      </div>
      <p className="doc-words">{doc.amountInWords}</p>

      <table className="doc-table">
        <tbody>
          <tr>
            <td>Received from the organizations (all time)</td>
            <td className="num">{formatCurrency(doc.company.receivedPkr, 'PKR')}</td>
          </tr>
          <tr>
            <td>Expenses (all time)</td>
            <td className="num">− {formatCurrency(doc.company.expensesPkr, 'PKR')}</td>
          </tr>
          <tr>
            <td>Already sent to the owners before</td>
            <td className="num">− {formatCurrency(doc.company.alreadySentPkr, 'PKR')}</td>
          </tr>
          <tr className="is-strong">
            <td>Shared between all owners now</td>
            <td className="num">{formatCurrency(doc.company.sharedNowPkr, 'PKR')}</td>
          </tr>
        </tbody>
      </table>

      {doc.note && <p className="cell-muted">Note: {doc.note}</p>}

      <div className="doc-bottom">
        <Qr verify={doc.verify} />
        <Foot letterhead={doc.letterhead} />
      </div>
    </div>
  )
}

export default PayoutDocument
