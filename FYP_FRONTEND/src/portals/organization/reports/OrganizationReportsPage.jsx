import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { Stars } from '../../../components/reviews/Stars.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { organizationReportsApi } from '../../../services/organization/organizationService.js'
import { downloadCsv } from '../../../utils/csv.js'
import { formatCurrency, formatDate, formatMonth } from '../../../utils/format.js'
import '../../admin/finance/FinanceTiles.css'
import '../../admin/reports/ReportsPage.css'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'

const TABS = [
  { id: 'usage', label: 'Employees & hours' },
  { id: 'financial', label: 'Billing' },
]

const pad = (value) => String(value).padStart(2, '0')
const toInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const now = () => new Date()

const DAY_PRESETS = [
  { id: '7', label: 'Last 7 days', range: () => ({ from: toInput(new Date(Date.now() - 6 * 86400000)), to: toInput(now()) }) },
  { id: '30', label: 'Last 30 days', range: () => ({ from: toInput(new Date(Date.now() - 29 * 86400000)), to: toInput(now()) }) },
  { id: '90', label: 'Last 90 days', range: () => ({ from: toInput(new Date(Date.now() - 89 * 86400000)), to: toInput(now()) }) },
  { id: 'month', label: 'This month', range: () => ({ from: toInput(new Date(now().getFullYear(), now().getMonth(), 1)), to: toInput(now()) }) },
]
const MONTH_PRESETS = [
  { id: '3', label: 'Last 3 months', range: () => ({ from: toInput(new Date(now().getFullYear(), now().getMonth() - 2, 1)), to: toInput(now()) }) },
  { id: '6', label: 'Last 6 months', range: () => ({ from: toInput(new Date(now().getFullYear(), now().getMonth() - 5, 1)), to: toInput(now()) }) },
  { id: 'year', label: 'This year', range: () => ({ from: toInput(new Date(now().getFullYear(), 0, 1)), to: toInput(now()) }) },
]
const defaultPreset = (tab) => (tab === 'financial' ? MONTH_PRESETS[1] : DAY_PRESETS[1])

function Tile({ label, value, caption, tone = '' }) {
  return (
    <article className={`card finance-tile ${tone ? `finance-tile--${tone}` : ''}`}>
      <p className="finance-tile__label">{label}</p>
      <p className="finance-tile__value">{value}</p>
      {caption && <p className="finance-tile__caption">{caption}</p>}
    </article>
  )
}

function Bar({ value, max, label }) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="report-bar" role="img" aria-label={label}>
      <span className="report-bar__fill" style={{ width: `${width}%` }} />
    </div>
  )
}

function Section({ title, action, children }) {
  return (
    <section className="card">
      <div className="card__header">
        <h3 className="card__title">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function Frame({ fetcher, keyPart, children }) {
  const { data, error, loading, reload } = useFetch(fetcher, keyPart)
  if (error && !data) return <div className="card"><ErrorState error={error} onRetry={reload} /></div>
  if (!data && loading) return <div className="card"><Spinner label="Building the report..." /></div>
  return <div className="report-body" aria-busy={loading}>{children(data)}</div>
}

const money = (list) => (list.length === 0 ? '—' : list.map((row) => formatCurrency(row.amount, row.currency)).join(' · '))

function UsageReport({ from, to }) {
  return (
    <Frame fetcher={(signal) => organizationReportsApi.usage({ from, to }, signal)} keyPart={`org-usage-${from}-${to}`}>
      {(report) => {
        const s = report.staffing
        const maxEmployee = Math.max(1, ...report.employees.map((e) => e.hours))
        const maxDay = Math.max(1, ...report.daily.map((d) => d.hours))
        return (
          <>
            <section className="finance-tiles">
              <Tile label="Employee-hours used" value={s.employeeHours.toLocaleString()} caption={`over ${Math.round(s.periodHours)} hours`} />
              <Tile label="Employees who worked" value={s.employeesWorked} caption={`${s.avgConcurrent} on duty on average`} />
              <Tile label="Most at the same time" value={s.peakConcurrent} caption={s.contractMax != null ? `contract: ${s.contractMin ?? '—'} – ${s.contractMax}` : 'no active contract'} tone="gold" />
              <Tile label="Use of contract maximum" value={s.utilizationPct != null ? `${s.utilizationPct}%` : '—'} />
            </section>

            <Section
              title="Employees"
              action={
                <Button variant="secondary" onClick={() => downloadCsv(`my-employees-${from}-to-${to}.csv`, ['Employee', 'Employee-hours', 'Days worked', 'Your last rating'], report.employees.map((e) => [e.name, e.hours, e.days, e.myRating ?? '']))}>
                  <Icon name="file" size={16} /> Export CSV
                </Button>
              }
            >
              {report.employees.length === 0 ? (
                <EmptyState icon="users" title="Nobody worked for you in this period" />
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Employee-hours</th>
                        <th className="num">Days</th>
                        <th>Your rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.employees.map((employee) => (
                        <tr key={employee.employeeId}>
                          <td>
                            <Link className="person__name" to={`/organization/employees/${employee.employeeId}`}>
                              {employee.name}
                            </Link>
                          </td>
                          <td className="report-cell">
                            <span className="report-cell__value">{employee.hours.toLocaleString()}</span>
                            <Bar value={employee.hours} max={maxEmployee} label={`${employee.hours} employee-hours`} />
                          </td>
                          <td className="num">{employee.days}</td>
                          <td>{employee.myRating != null ? <Stars value={employee.myRating} /> : <span className="cell-muted">Not reviewed</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <Section
              title="Day by day"
              action={
                <Button variant="secondary" onClick={() => downloadCsv(`my-daily-hours-${from}-to-${to}.csv`, ['Date', 'Employee-hours'], report.daily.map((d) => [d.date, d.hours]))}>
                  <Icon name="file" size={16} /> Export CSV
                </Button>
              }
            >
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Employee-hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.daily.map((day) => (
                      <tr key={day.date}>
                        <td>{formatDate(day.date)}</td>
                        <td className="report-cell">
                          <span className="report-cell__value">{day.hours.toLocaleString()}</span>
                          <Bar value={day.hours} max={maxDay} label={`${day.hours} employee-hours`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <section className="finance-tiles">
              <Tile label="Staff requests" value={report.requests.total} caption={`${report.requests.approved} approved · ${report.requests.rejected} rejected · ${report.requests.pending} waiting`} />
              <Tile label="Extra employees asked" value={report.requests.employeesAsked} />
              <Tile label="Reviews you gave" value={report.reviews.count} caption={report.reviews.average != null ? `average ${Number(report.reviews.average).toFixed(1)} / 5 · ${report.reviews.bad} bad` : 'none in this period'} />
            </section>
          </>
        )
      }}
    </Frame>
  )
}

function FinancialReport({ from, to }) {
  return (
    <Frame fetcher={(signal) => organizationReportsApi.financial({ from, to }, signal)} keyPart={`org-fin-${from}-${to}`}>
      {(report) => (
        <>
          <section className="finance-tiles">
            <Tile label="Invoiced" value={money(report.totalInvoiced)} caption="invoices issued in this period" />
            <Tile label="Paid" value={money(report.totalPaid)} caption="payments received in this period" />
            <Tile label="Still to pay" value={money(report.outstanding)} caption="all open invoices" tone="gold" />
            <Tile label="Overdue" value={money(report.overdue)} tone={report.overdue.length > 0 ? 'danger' : ''} />
          </section>

          <Section
            title="Month by month"
            action={
              <Button
                variant="secondary"
                onClick={() =>
                  downloadCsv(`my-billing-${from}-to-${to}.csv`, ['Month', 'Invoiced', 'Paid'], report.months.map((m) => [formatMonth(m.year, m.month), m.invoiced.map((x) => `${x.amount} ${x.currency}`).join(' + '), m.paid.map((x) => `${x.amount} ${x.currency}`).join(' + ')]))
                }
              >
                <Icon name="file" size={16} /> Export CSV
              </Button>
            }
          >
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Invoiced</th>
                    <th>Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {report.months.map((m) => (
                    <tr key={`${m.year}-${m.month}`}>
                      <td>{formatMonth(m.year, m.month)}</td>
                      <td>{money(m.invoiced)}</td>
                      <td>{money(m.paid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </Frame>
  )
}

/** Organization: its own reports for any period - the hours it used, and what it was billed and paid. Export a table as CSV to open it in Excel. */
function OrganizationReportsPage() {
  const [tab, setTab] = useState('usage')
  const [preset, setPreset] = useState(defaultPreset('usage').id)
  const [range, setRange] = useState(defaultPreset('usage').range())
  const presets = tab === 'financial' ? MONTH_PRESETS : DAY_PRESETS
  const invalid = range.from && range.to && range.from > range.to

  function changeTab(next) {
    setTab(next)
    const fallback = defaultPreset(next)
    setPreset(fallback.id)
    setRange(fallback.range())
  }
  const editDate = (field) => (event) => {
    setPreset('custom')
    setRange((current) => ({ ...current, [field]: event.target.value }))
  }
  const Report = tab === 'financial' ? FinancialReport : UsageReport

  return (
    <div className="page">
      <PageHeader title="Reports" description="Your own numbers for any period: the employees and hours you used, your staff requests and reviews, and your billing." />

      <div className="tabs" role="tablist" aria-label="Reports">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`tabs__tab ${tab === item.id ? 'is-active' : ''}`} onClick={() => changeTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      <section className="card">
        <div className="toolbar">
          <div className="report-presets" role="group" aria-label="Period">
            {presets.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`report-preset ${preset === item.id ? 'is-active' : ''}`}
                onClick={() => {
                  setPreset(item.id)
                  setRange(item.range())
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <TextField className="toolbar__filter" label="From" type="date" value={range.from} onChange={editDate('from')} error={invalid ? 'Start is after the end.' : undefined} />
          <TextField className="toolbar__filter" label="To" type="date" value={range.to} onChange={editDate('to')} />
        </div>
      </section>

      {invalid || !range.from || !range.to ? (
        <div className="card">
          <EmptyState icon="alert" title="Choose a valid period" text="Pick a start date that is not after the end date." />
        </div>
      ) : (
        <Report key={`${tab}-${range.from}-${range.to}`} from={range.from} to={range.to} />
      )}
    </div>
  )
}

export default OrganizationReportsPage
