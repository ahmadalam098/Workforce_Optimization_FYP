import { useState } from 'react'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { employeeSalaryApi } from '../../../services/employee/employeeService.js'
import { formatCurrency, formatDate, formatMonth } from '../../../utils/format.js'
import '../../admin/finance/FinanceTiles.css'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'

const STATUS_TONES = { Paid: 'success', Approved: 'info', Draft: 'neutral', NotProcessed: 'warning', Upcoming: 'neutral', BeforeStart: 'neutral' }

function money(amount, currency) {
  return amount == null ? '—' : formatCurrency(amount, currency || 'PKR')
}

/** "PKR 120,000 (3 months)" for every currency, or a dash when there is nothing. */
function totalsText(list) {
  if (!list || list.length === 0) return '—'
  return list.map((entry) => formatCurrency(entry.amount, entry.currency || 'PKR')).join(' + ')
}

function monthsText(list) {
  const count = (list ?? []).reduce((sum, entry) => sum + entry.months, 0)
  return `${count} ${count === 1 ? 'month' : 'months'}`
}

function downloadCsv(report) {
  const rows = [['Month', 'Status', 'Base salary', 'Overtime hours', 'Overtime amount', 'Adjustment', 'Total', 'Currency', 'Paid on']]
  report.months.forEach((month) => {
    rows.push([
      formatMonth(report.year, month.month),
      month.statusLabel,
      month.baseSalary ?? '',
      month.overtimeHours ?? '',
      month.overtimeAmount ?? '',
      month.adjustment ?? '',
      month.totalAmount ?? '',
      month.currency ?? '',
      month.paidAt ? formatDate(month.paidAt) : '',
    ])
  })
  const text = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `salary-report-${report.year}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

/** Employee: my salary report - what the admin decided, which months were paid and which are still to come. Same data as the admin and my manager see. */
function EmployeeSalaryPage() {
  const [year, setYear] = useState('')
  const { data, error, loading, reload } = useFetch((signal) => employeeSalaryApi.report(year, signal), `employee-salary-${year}`)

  if (!data && loading) return <Spinner label="Loading your salary report..." />
  if (!data) {
    return (
      <div className="card">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  if (!data.hasEmployeeRecord) {
    return (
      <div className="page">
        <PageHeader title="My Salary" description="Your salary report." />
        <section className="card">
          <div className="card__body">
            <EmptyState icon="users" title="Your employee profile is not set up yet" text="Please ask the admin to complete your employee record." />
          </div>
        </section>
      </div>
    )
  }

  const { currentSalary, history, months, summary } = data
  const yearOptions = data.years.map((value) => ({ value: String(value), label: String(value) }))

  return (
    <div className="page">
      <PageHeader
        title="My Salary"
        description="Your monthly salary as decided by the admin, and what has been paid or is still to come. Your organization manager sees the same status."
        actions={
          currentSalary && (
            <Button variant="secondary" onClick={() => downloadCsv(data)}>
              <Icon name="file" size={18} /> Download {data.year} (CSV)
            </Button>
          )
        }
      />

      {!currentSalary ? (
        <section className="card">
          <div className="card__body">
            <EmptyState icon="chart" title="No salary set yet" text="The admin has not set your monthly salary yet. It will appear here as soon as it is set." />
          </div>
        </section>
      ) : (
        <>
          <section className="finance-tiles" aria-label="Overview">
            <article className="card finance-tile">
              <p className="finance-tile__label">Monthly salary</p>
              <p className="finance-tile__value" style={{ fontSize: '1.35rem' }}>{money(currentSalary.monthlySalary, currentSalary.currency)}</p>
              <p className="finance-tile__caption">Since {formatDate(currentSalary.since)}</p>
            </article>
            <article className="card finance-tile">
              <p className="finance-tile__label">Received in {data.year}</p>
              <p className="finance-tile__value" style={{ fontSize: '1.35rem' }}>{totalsText(summary.received)}</p>
              <p className="finance-tile__caption">{summary.paidMonths} {summary.paidMonths === 1 ? 'month' : 'months'} paid</p>
            </article>
            <article className={`card finance-tile ${summary.pendingMonths > 0 ? 'finance-tile--gold' : ''}`}>
              <p className="finance-tile__label">Still to receive in {data.year}</p>
              <p className="finance-tile__value" style={{ fontSize: '1.35rem' }}>{totalsText(summary.pending)}</p>
              <p className="finance-tile__caption">{monthsText(summary.pending)} not paid yet</p>
            </article>
          </section>

          <section className="card">
            <div className="card__header">
              <h3 className="card__title">Month by month</h3>
            </div>
            <div className="toolbar">
              <SelectField className="toolbar__filter" label="Year" value={String(data.year)} onChange={(event) => setYear(event.target.value)} options={yearOptions} />
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Status</th>
                    <th>Base salary</th>
                    <th>Overtime</th>
                    <th>Adjustment</th>
                    <th>Total</th>
                    <th>Paid on</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((month) => {
                    const faded = month.status === 'Upcoming' || month.status === 'BeforeStart'
                    return (
                      <tr key={month.month} className={faded ? 'is-inactive' : ''}>
                        <td>
                          <strong>{formatMonth(data.year, month.month)}</strong>
                        </td>
                        <td>
                          <Badge tone={STATUS_TONES[month.status] || 'neutral'}>{month.statusLabel}</Badge>
                        </td>
                        <td>{money(month.baseSalary, month.currency)}</td>
                        <td>
                          {month.overtimeAmount == null ? '—' : money(month.overtimeAmount, month.currency)}
                          {month.overtimeHours ? <span className="person__sub">{month.overtimeHours} h</span> : null}
                        </td>
                        <td>
                          {month.adjustment == null || month.adjustment === 0 ? '—' : money(month.adjustment, month.currency)}
                          {month.adjustmentNote ? <span className="person__sub">{month.adjustmentNote}</span> : null}
                        </td>
                        <td>
                          {month.totalAmount != null ? (
                            <strong>{money(month.totalAmount, month.currency)}</strong>
                          ) : month.expectedAmount != null && !faded ? (
                            <span className="cell-muted" title="The monthly salary the admin decided">{money(month.expectedAmount, month.currency)} due</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="cell-muted">{month.paidAt ? formatDate(month.paidAt) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {history.length > 1 && (
            <section className="card">
              <div className="card__header">
                <h3 className="card__title">Salary changes</h3>
              </div>
              <ul className="card__body plain-list">
                {history.map((entry) => (
                  <li key={`${entry.from}-${entry.monthlySalary}`}>
                    <strong>{money(entry.monthlySalary, entry.currency)}</strong> <span className="cell-muted">per month · {formatDate(entry.from)} – {entry.to ? formatDate(entry.to) : 'now'}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

export default EmployeeSalaryPage
