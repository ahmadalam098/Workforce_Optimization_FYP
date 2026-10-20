import { Link } from 'react-router-dom'
import Button from '../ui/Button.jsx'
import Icon from '../ui/Icon.jsx'
import Spinner from '../ui/Spinner.jsx'
import { useFetch } from '../../hooks/useFetch.js'
import { downloadCsv } from '../../utils/csv.js'
import { formatCurrency, formatCurrencyWhole, formatDate } from '../../utils/format.js'
import '../../portals/admin/finance/FinanceTiles.css'
import { EmptyState, ErrorState } from '../../portals/admin/shared/StateBox.jsx'

const BUCKETS = [
  ['notDue', 'Not due yet'],
  ['late1to30', '1 – 30 days late'],
  ['late31to60', '31 – 60 days'],
  ['late61to90', '61 – 90 days'],
  ['over90', 'Over 90 days'],
]

/**
 * What organizations still owe on issued invoices, by how late it is. `load(signal)` fetches the report (the admin's for everybody, the
 * manager's for their organizations); `invoiceLink(row)` opens an invoice in the portal; `remind(row)` (optional) sends a reminder for a late invoice.
 */
function ReceivablesReport({ load, invoiceLink, remind, fileName = 'receivables' }) {
  const { data, error, loading, reload } = useFetch(load, `receivables-${fileName}`)
  if (error && !data) return <div className="card"><ErrorState error={error} onRetry={reload} /></div>
  if (!data && loading) return <div className="card"><Spinner label="Building the report..." /></div>

  return (
    <div className="report-body">
      <section className="finance-tiles">
        {data.totals.length === 0 ? (
          <article className="card finance-tile">
            <p className="finance-tile__label">Still to receive</p>
            <p className="finance-tile__value">—</p>
            <p className="finance-tile__caption">Every invoice is paid</p>
          </article>
        ) : (
          data.totals.map((row) => (
            <article className={`card finance-tile ${row.late1to30 + row.late31to60 + row.late61to90 + row.over90 > 0 ? 'finance-tile--gold' : ''}`} key={row.currency}>
              <p className="finance-tile__label">Still to receive ({row.currency})</p>
              <p className="finance-tile__value">{formatCurrencyWhole(row.total, row.currency)}</p>
              <p className="finance-tile__caption">
                {formatCurrencyWhole(row.late1to30 + row.late31to60 + row.late61to90 + row.over90, row.currency)} late · {row.invoices} invoice{row.invoices === 1 ? '' : 's'}
              </p>
            </article>
          ))
        )}
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">By organization</h3>
          <Button
            variant="secondary"
            onClick={() =>
              downloadCsv(`${fileName}-${data.asOf}.csv`, ['Organization', 'Currency', ...BUCKETS.map(([, label]) => label), 'Total'], data.byOrganization.map((row) => [row.orgName, row.currency, ...BUCKETS.map(([key]) => row[key]), row.total]))
            }
          >
            <Icon name="file" size={16} /> Export CSV
          </Button>
        </div>
        {data.byOrganization.length === 0 ? (
          <EmptyState icon="checkCircle" title="Nothing is owed" text="Every issued invoice is paid." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Organization</th>
                  {BUCKETS.map(([key, label]) => (
                    <th className="num" key={key}>
                      {label}
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.byOrganization.map((row) => (
                  <tr key={`${row.orgId}-${row.currency}`}>
                    <td>
                      <strong>{row.orgName}</strong>
                      <span className="person__sub">
                        {row.currency} · {row.invoices} invoice{row.invoices === 1 ? '' : 's'}
                      </span>
                    </td>
                    {BUCKETS.map(([key]) => (
                      <td className="num" key={key} style={{ color: key !== 'notDue' && row[key] > 0 ? 'var(--danger-text, #a02a1d)' : undefined }}>
                        {row[key] > 0 ? formatCurrency(row[key], row.currency) : <span className="cell-muted">—</span>}
                      </td>
                    ))}
                    <td className="num">
                      <strong>{formatCurrency(row.total, row.currency)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.overdueInvoices.length > 0 && (
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Late invoices</h3>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Organization</th>
                  <th>Was due</th>
                  <th className="num">Days late</th>
                  <th className="num">Still owed</th>
                  {remind && (
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.overdueInvoices.map((row) => (
                  <tr key={row.invoiceId}>
                    <td>
                      <Link to={invoiceLink(row)}>
                        <strong>{row.invoiceNumber}</strong>
                      </Link>
                    </td>
                    <td>{row.orgName}</td>
                    <td className="cell-muted">{formatDate(row.dueDate)}</td>
                    <td className="num">{row.daysLate}</td>
                    <td className="num">{formatCurrency(row.balance, row.currency)}</td>
                    {remind && (
                      <td>
                        <Button variant="secondary" onClick={() => remind(row)}>
                          Send reminder
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

export default ReceivablesReport
