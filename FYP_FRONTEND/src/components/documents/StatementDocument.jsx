import { formatCurrency, formatDate } from '../../utils/format.js'
import { Foot, Head, Party } from './DocumentParts.jsx'
import { day } from './documentFormat.js'

/** The statement of account: for each currency what was owed at the start, every invoice and payment of the period, and what is owed at the end. */
function StatementDocument({ doc }) {
  return (
    <div className="doc-sheet">
      <Head letterhead={doc.letterhead} title={doc.title} number={doc.number} />

      <div className="doc-grid">
        <Party title="Account of" organization={doc.organization} />
        <dl className="doc-facts">
          <dt>Period</dt>
          <dd>
            {day(doc.from)} – {day(doc.to)}
          </dd>
          <dt>Prepared</dt>
          <dd>{formatDate(doc.generatedAt)}</dd>
        </dl>
      </div>

      {doc.currencies.length === 0 && <p className="doc-note">No invoice has been issued to this organization yet.</p>}

      {doc.currencies.map((section) => (
        <section key={section.currency}>
          <p className="doc-section-title">Account in {section.currency}</p>
          <table className="doc-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Document</th>
                <th>Details</th>
                <th className="num">Billed</th>
                <th className="num">Paid</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5}>Owed at the start of the period</td>
                <td className="num">{formatCurrency(section.opening, section.currency)}</td>
              </tr>
              {section.rows.map((row) => (
                <tr key={`${row.type}-${row.number}-${row.date}`}>
                  <td>{day(row.date)}</td>
                  <td>{row.number}</td>
                  <td>{row.description}</td>
                  <td className="num">{row.debit ? formatCurrency(row.debit, section.currency) : ''}</td>
                  <td className="num">{row.credit ? formatCurrency(row.credit, section.currency) : ''}</td>
                  <td className="num">{formatCurrency(row.balance, section.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Totals of the period</td>
                <td className="num">{formatCurrency(section.totalDebit, section.currency)}</td>
                <td className="num">{formatCurrency(section.totalCredit, section.currency)}</td>
                <td />
              </tr>
              <tr className="is-strong">
                <td colSpan={5}>You owe now</td>
                <td className="num">{formatCurrency(section.closing, section.currency)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      ))}

      {doc.letterhead.bankDetails && (
        <div className="doc-pay">
          <p className="doc-label">How to pay</p>
          {doc.letterhead.bankDetails}
        </div>
      )}
      <div className="doc-bottom">
        <span />
        <Foot letterhead={doc.letterhead} />
      </div>
    </div>
  )
}

export default StatementDocument
