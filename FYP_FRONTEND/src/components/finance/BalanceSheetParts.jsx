import { useState } from 'react'
import Badge from '../ui/Badge.jsx'
import Pagination from '../ui/Pagination.jsx'
import SelectField from '../ui/SelectField.jsx'
import Spinner from '../ui/Spinner.jsx'
import { useFetch } from '../../hooks/useFetch.js'
import { formatCurrency, formatCurrencyWhole, formatDate, formatDateTime } from '../../utils/format.js'
import '../../portals/admin/finance/FinanceTiles.css'
import { EmptyState, ErrorState } from '../../portals/admin/shared/StateBox.jsx'

/**
 * The pieces of the company's balance sheet. The admin and the business owners see the same figures (everything is in PKR):
 * RECEIVED (what the organizations paid) - EXPENSES (written down by the admin) - SENT (shared with the business owners) = WAITING (the profit
 * that has not been sent yet).
 */

export function BalanceTiles({ balance }) {
  return (
    <section className="finance-tiles" aria-label="Balance">
      <article className="card finance-tile">
        <p className="finance-tile__label">Received from organizations</p>
        <p className="finance-tile__value">{formatCurrencyWhole(balance.received, 'PKR')}</p>
        <p className="finance-tile__caption">all payments, in PKR</p>
      </article>
      <article className="card finance-tile">
        <p className="finance-tile__label">Expenses</p>
        <p className="finance-tile__value">{formatCurrencyWhole(balance.expenses, 'PKR')}</p>
        <p className="finance-tile__caption">taken off the money</p>
      </article>
      <article className="card finance-tile">
        <p className="finance-tile__label">Sent to the owners</p>
        <p className="finance-tile__value">{formatCurrencyWhole(balance.sent, 'PKR')}</p>
        <p className="finance-tile__caption">{balance.lastSettlementAt ? `last on ${formatDate(balance.lastSettlementAt)}` : 'nothing sent yet'}</p>
      </article>
      <article className={`card finance-tile ${balance.available < 0 ? 'finance-tile--danger' : 'finance-tile--gold'}`}>
        <p className="finance-tile__label">Waiting to be sent</p>
        <p className="finance-tile__value">{formatCurrencyWhole(balance.available, 'PKR')}</p>
        <p className="finance-tile__caption">received − expenses − sent</p>
      </article>
    </section>
  )
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** How much came in during one month and from which organization. `month` is what the server sent; `onMonth(number)` asks for another month. */
export function MonthReceived({ month, year, onMonth }) {
  const options = MONTH_NAMES.map((name, index) => ({ value: String(index + 1), label: `${name} ${year}` }))
  return (
    <section className="card">
      <div className="card__header">
        <h3 className="card__title">Money received in {month.label}</h3>
        <SelectField label="Month" value={String(month.month)} onChange={(event) => onMonth(Number(event.target.value))} options={options} />
      </div>
      <div className="card__body">
        <p>
          <strong>{formatCurrency(month.totalPkr, 'PKR')}</strong> came in from {month.byOrganization.length} organization{month.byOrganization.length === 1 ? '' : 's'}
          <span className="cell-muted"> · {month.payments} payment{month.payments === 1 ? '' : 's'}</span>
        </p>
      </div>
      {month.byOrganization.length === 0 ? (
        <EmptyState icon="building" title="Nothing received in this month" text="When an organization pays an invoice, it appears here with the amount." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th className="num">Payments</th>
                <th className="num">Paid (PKR)</th>
                <th className="num">Share of the month</th>
              </tr>
            </thead>
            <tbody>
              {month.byOrganization.map((row) => (
                <tr key={row.orgId}>
                  <td>
                    <strong>{row.orgName}</strong>
                  </td>
                  <td className="num">{row.payments}</td>
                  <td className="num">{formatCurrency(row.amountPkr, 'PKR')}</td>
                  <td className="num cell-muted">{month.totalPkr > 0 ? `${Math.round((row.amountPkr / month.totalPkr) * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>
                  <strong>Total</strong>
                </td>
                <td className="num">
                  <strong>{formatCurrency(month.totalPkr, 'PKR')}</strong>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}

/** Month by month: opening balance, received, expenses, sent to the owners and what stays. */
export function MonthlySheet({ sheet, onYear }) {
  const rows = sheet.months
  return (
    <section className="card">
      <div className="card__header">
        <h3 className="card__title">Balance sheet {sheet.year}</h3>
        <SelectField label="Year" value={String(sheet.year)} onChange={(event) => onYear(Number(event.target.value))} options={sheet.years.map((year) => ({ value: String(year), label: String(year) }))} />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="chart" title="Nothing in this year yet" text="Months appear here once money is received or an expense is written down." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Brought forward</th>
                <th className="num">Received</th>
                <th className="num">Expenses</th>
                <th className="num">Profit of the month</th>
                <th className="num">Sent to owners</th>
                <th className="num">Left at month end</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.month}>
                  <td>
                    <strong>{row.label}</strong>
                  </td>
                  <td className="num cell-muted">{formatCurrency(row.openingPkr, 'PKR')}</td>
                  <td className="num">{formatCurrency(row.receivedPkr, 'PKR')}</td>
                  <td className="num">{row.expensesPkr > 0 ? formatCurrency(row.expensesPkr, 'PKR') : '—'}</td>
                  <td className="num">
                    <strong style={{ color: row.netPkr < 0 ? 'var(--danger)' : 'inherit' }}>{formatCurrency(row.netPkr, 'PKR')}</strong>
                  </td>
                  <td className="num">{row.sentToOwnersPkr > 0 ? formatCurrency(row.sentToOwnersPkr, 'PKR') : '—'}</td>
                  <td className="num">
                    <strong>{formatCurrency(row.closingPkr, 'PKR')}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>
                  <strong>Total {sheet.year}</strong>
                </td>
                <td className="num">
                  <strong>{formatCurrency(sheet.totals.receivedPkr, 'PKR')}</strong>
                </td>
                <td className="num">
                  <strong>{formatCurrency(sheet.totals.expensesPkr, 'PKR')}</strong>
                </td>
                <td className="num">
                  <strong>{formatCurrency(sheet.totals.receivedPkr - sheet.totals.expensesPkr, 'PKR')}</strong>
                </td>
                <td className="num">
                  <strong>{formatCurrency(sheet.totals.sentToOwnersPkr, 'PKR')}</strong>
                </td>
                <td className="num">
                  <strong>{formatCurrency(sheet.closingPkr, 'PKR')}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}

const KIND = {
  received: { label: 'Received', tone: 'success', sign: '+' },
  expense: { label: 'Expense', tone: 'warning', sign: '−' },
  sentToOwners: { label: 'Sent to owners', tone: 'info', sign: '−' },
}

/** Every money movement, newest first. `load(page, signal)` returns { items, total, page, pageSize }. */
export function Transactions({ load, cacheKey }) {
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useFetch((signal) => load(page, signal), `${cacheKey}-${page}`)
  return (
    <section className="card">
      <div className="card__header">
        <h3 className="card__title">Transactions</h3>
      </div>
      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data && loading ? (
        <Spinner label="Loading transactions..." />
      ) : data.items.length === 0 ? (
        <EmptyState icon="file" title="No transactions yet" text="Payments from organizations, expenses and money sent to the owners are listed here." />
      ) : (
        <>
          <div className="table-wrap" aria-busy={loading}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>What</th>
                  <th>Type</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, index) => {
                  const kind = KIND[item.kind] ?? KIND.received
                  return (
                    <tr key={`${item.when}-${index}`}>
                      <td className="cell-muted cell-date">{item.kind === 'expense' ? formatDate(item.when) : formatDateTime(item.when)}</td>
                      <td>{item.text}</td>
                      <td>
                        <Badge tone={kind.tone} dot>
                          {kind.label}
                        </Badge>
                      </td>
                      <td className="num">
                        <strong style={{ color: item.kind === 'received' ? 'var(--success-text, inherit)' : 'inherit' }}>
                          {kind.sign} {formatCurrency(item.amountPkr, 'PKR')}
                        </strong>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        </>
      )}
    </section>
  )
}
