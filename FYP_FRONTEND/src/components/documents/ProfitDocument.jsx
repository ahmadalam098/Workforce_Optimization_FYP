import { formatCurrency, formatDate } from '../../utils/format.js'
import { Foot, Head } from './DocumentParts.jsx'
import { day } from './documentFormat.js'

/** The profit statement of a period: what was received from organizations, what was paid as salaries, the profit and each owner's share (all in PKR). */
function ProfitDocument({ doc }) {
  return (
    <div className="doc-sheet">
      <Head letterhead={doc.letterhead} title={doc.title} number={doc.number} />

      <dl className="doc-facts" style={{ marginBottom: '0.75rem' }}>
        <dt>Period</dt>
        <dd>
          {day(doc.from)} – {day(doc.to)}
        </dd>
        <dt>Prepared</dt>
        <dd>{formatDate(doc.generatedAt)}</dd>
      </dl>

      <table className="doc-table">
        <thead>
          <tr>
            <th>Month</th>
            <th className="num">Received from organizations</th>
            <th className="num">Salaries</th>
            <th className="num">Profit</th>
          </tr>
        </thead>
        <tbody>
          {doc.months.map((month) => (
            <tr key={`${month.year}-${month.month}`}>
              <td>{month.label}</td>
              <td className="num">{formatCurrency(month.revenuePkr, 'PKR')}</td>
              <td className="num">{formatCurrency(month.expensePkr, 'PKR')}</td>
              <td className="num">{formatCurrency(month.profitPkr, 'PKR')}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="is-strong">
            <td>Total</td>
            <td className="num">{formatCurrency(doc.revenuePkr, 'PKR')}</td>
            <td className="num">{formatCurrency(doc.expensePkr, 'PKR')}</td>
            <td className="num">{formatCurrency(doc.profitPkr, 'PKR')}</td>
          </tr>
        </tfoot>
      </table>

      <p className="doc-section-title">Share of each owner</p>
      {doc.owners.length === 0 ? (
        <p className="doc-note">There is no active business owner account.</p>
      ) : (
        <table className="doc-table">
          <tbody>
            {doc.owners.map((owner) => (
              <tr key={owner.name}>
                <td>{owner.name}</td>
                <td className="num">{formatCurrency(owner.sharePkr, 'PKR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="doc-note">Profit is what was received minus the salaries of the same months. The owners share it equally.</p>

      <div className="doc-bottom">
        <span />
        <Foot letterhead={doc.letterhead} />
      </div>
    </div>
  )
}

export default ProfitDocument
