import { formatCurrency } from '../../utils/format.js'
import { Facts, Foot, Head, Qr, Stamp } from './DocumentParts.jsx'
import { day } from './documentFormat.js'

/** The salary slip of one month: base salary and any adjustment, the total, where it is paid and whether it was paid. */
function PayslipDocument({ doc, layout }) {
  const slip = layout === 'slip'
  const c = doc.currency
  return (
    <div className={`doc-sheet ${slip ? 'doc-sheet--slip' : ''}`}>
      <Head letterhead={doc.letterhead} title={doc.title} number={doc.number}>
        <p>{doc.period.label}</p>
      </Head>
      <Stamp text={doc.status === 'Paid' ? 'Paid' : 'Approved'} tone={doc.status === 'Paid' ? 'success' : 'neutral'} />

      <div className="doc-grid">
        <div>
          <p className="doc-label">Employee</p>
          <strong>{doc.employee.name}</strong>
          <div>{doc.employee.code}</div>
          {doc.employee.organization && <div>{doc.employee.organization}</div>}
        </div>
        <Facts
          rows={[
            ['Month', doc.period.label],
            ['Paid on', doc.status === 'Paid' ? day(doc.paidAt) : ''],
            ['Bank', doc.bank?.bankName],
            ['Account', doc.bank?.account],
          ]}
        />
      </div>

      <table className="doc-table">
        <thead>
          <tr>
            <th>Earnings</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Base salary</td>
            <td className="num">{formatCurrency(doc.baseSalary, c)}</td>
          </tr>
          {doc.overtimeAmount > 0 && (
            <tr>
              <td>Overtime ({doc.overtimeHours} h)</td>
              <td className="num">{formatCurrency(doc.overtimeAmount, c)}</td>
            </tr>
          )}
          {doc.adjustment !== 0 && (
            <tr>
              <td>{doc.adjustmentNote || 'Adjustment'}</td>
              <td className="num">{formatCurrency(doc.adjustment, c)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="doc-totals">
        <div className="is-total">
          <span>Net salary</span>
          <span>{formatCurrency(doc.total, c)}</span>
        </div>
        {doc.exchangeRate && (
          <div>
            <span>In PKR (rate {doc.exchangeRate})</span>
            <span>{formatCurrency(doc.totalPkr, 'PKR')}</span>
          </div>
        )}
      </div>
      <p className="doc-words">{doc.amountInWords}</p>

      <div className="doc-bottom">
        <Qr verify={doc.verify} />
        <Foot letterhead={doc.letterhead} />
      </div>
    </div>
  )
}

export default PayslipDocument
