import { formatCurrency } from '../../utils/format.js'
import { Foot, Head } from './DocumentParts.jsx'
import { day } from './documentFormat.js'

/** The payroll sheet (bank sheet) of a month: every employee, where the salary goes and how much, with the total. */
function PayrollSheetDocument({ doc }) {
  return (
    <div className="doc-sheet">
      <Head letterhead={doc.letterhead} title={doc.title} number={doc.number}>
        <p>{doc.period.label}</p>
      </Head>

      <dl className="doc-facts" style={{ marginBottom: '0.75rem' }}>
        <dt>Status</dt>
        <dd>{doc.status}</dd>
        {doc.paidAt && (
          <>
            <dt>Paid on</dt>
            <dd>{day(doc.paidAt)}</dd>
          </>
        )}
        <dt>Employees</dt>
        <dd>{doc.items.length}</dd>
      </dl>
      {doc.missingBank > 0 && <p className="doc-note">{doc.missingBank} employee(s) have no bank details yet: the employee or the admin must add them before paying.</p>}

      <table className="doc-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Employee</th>
            <th>Bank</th>
            <th>Account title</th>
            <th>Account / IBAN</th>
            <th className="num">Net salary</th>
            <th className="num">In PKR</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((item, index) => (
            <tr key={item.itemId}>
              <td>{index + 1}</td>
              <td>{item.name}</td>
              <td>{item.bankName || <em>missing</em>}</td>
              <td>{item.accountTitle}</td>
              <td>{item.accountNumber}</td>
              <td className="num">{formatCurrency(item.total, item.currency)}</td>
              <td className="num">{formatCurrency(item.totalPkr, 'PKR')}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="is-strong">
            <td colSpan={6}>Total to pay</td>
            <td className="num">{formatCurrency(doc.totalPkr, 'PKR')}</td>
          </tr>
        </tfoot>
      </table>

      <div className="doc-sign">
        <span>Prepared by</span>
        <span>Approved by</span>
      </div>
      <div className="doc-bottom">
        <span />
        <Foot letterhead={doc.letterhead} />
      </div>
    </div>
  )
}

export default PayrollSheetDocument
