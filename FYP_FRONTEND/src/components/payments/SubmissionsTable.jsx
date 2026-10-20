import { Link } from 'react-router-dom'
import Badge from '../ui/Badge.jsx'
import { proofUrl } from '../../services/documents/documentsService.js'
import { formatCurrency, formatDate, formatTimeAgo } from '../../utils/format.js'

const TONES = { Pending: 'warning', Verified: 'info', Approved: 'success', Rejected: 'danger', Withdrawn: 'neutral' }
const LABELS = { Pending: 'Waiting for the manager', Verified: 'Verified, waiting for the admin' }

/**
 * The payment notices (organizations announcing a payment): the same table in the admin, manager and organization portals.
 * `showOrganization` adds the organization column; `invoiceLink(row)` / `receiptLink(row)` give the portal's own pages; `actions(row)` is the
 * portal's buttons for a row.
 */
function SubmissionsTable({ rows, showOrganization = true, invoiceLink, receiptLink, actions }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {showOrganization && <th>Organization</th>}
            <th>Invoice</th>
            <th className="num">Amount</th>
            <th>How</th>
            <th>Paid on</th>
            <th>Status</th>
            {actions && (
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.submissionId}>
              {showOrganization && (
                <td>
                  <strong>{row.orgName}</strong>
                  <span className="person__sub">{formatTimeAgo(row.submittedAt)}</span>
                </td>
              )}
              <td>
                {invoiceLink ? <Link to={invoiceLink(row)}>{row.invoiceNumber}</Link> : row.invoiceNumber}
                {!showOrganization && <span className="person__sub">{formatTimeAgo(row.submittedAt)}</span>}
              </td>
              <td className="num">{formatCurrency(row.amount, row.currency)}</td>
              <td>
                {row.method}
                {row.reference && <span className="person__sub">{row.reference}</span>}
                {row.hasProof && (
                  <a className="person__sub" href={proofUrl(row.submissionId)} target="_blank" rel="noreferrer">
                    View proof
                  </a>
                )}
              </td>
              <td className="cell-muted">{formatDate(row.paidOn)}</td>
              <td>
                <Badge tone={TONES[row.status] ?? 'neutral'}>{LABELS[row.status] ?? row.status}</Badge>
                {row.verifiedBy && row.status !== 'Pending' && <span className="person__sub">Checked by {row.verifiedBy}</span>}
                {row.status === 'Approved' && row.receiptNumber && (receiptLink ? <Link className="person__sub" to={receiptLink(row)}>Receipt {row.receiptNumber}</Link> : <span className="person__sub">Receipt {row.receiptNumber}</span>)}
                {row.status === 'Rejected' && row.decisionNote && <span className="person__sub">{row.decisionNote}</span>}
              </td>
              {actions && <td>{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default SubmissionsTable
