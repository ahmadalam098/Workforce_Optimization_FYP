import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { reportsApi } from '../../../services/admin/adminService.js'
import { downloadCsv } from '../../../utils/csv.js'
import { formatCurrency, formatCurrencyWhole, formatDate, formatMonth, humanize } from '../../../utils/format.js'
import PageHeader from '../shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'
import '../finance/FinanceTiles.css'
import './ReportsPage.css'

const TABS = [
  { id: 'utilization', label: 'Utilization' },
  { id: 'allocations', label: 'Allocation' },
  { id: 'financial', label: 'Financial' },
]

const pad = (value) => String(value).padStart(2, '0')
const toInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const DAY_PRESETS = [
  { id: '7', label: 'Last 7 days', range: () => ({ from: toInput(new Date(Date.now() - 6 * 86400000)), to: toInput(new Date()) }) },
  { id: '30', label: 'Last 30 days', range: () => ({ from: toInput(new Date(Date.now() - 29 * 86400000)), to: toInput(new Date()) }) },
  { id: '90', label: 'Last 90 days', range: () => ({ from: toInput(new Date(Date.now() - 89 * 86400000)), to: toInput(new Date()) }) },
  { id: 'month', label: 'This month', range: () => { const n = new Date(); return { from: toInput(new Date(n.getFullYear(), n.getMonth(), 1)), to: toInput(n) } } },
  { id: 'last', label: 'Last month', range: () => { const n = new Date(); return { from: toInput(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: toInput(new Date(n.getFullYear(), n.getMonth(), 0)) } } },
]

const MONTH_PRESETS = [
  { id: 'month', label: 'This month', range: () => { const n = new Date(); return { from: toInput(new Date(n.getFullYear(), n.getMonth(), 1)), to: toInput(n) } } },
  { id: '3', label: 'Last 3 months', range: () => { const n = new Date(); return { from: toInput(new Date(n.getFullYear(), n.getMonth() - 2, 1)), to: toInput(n) } } },
  { id: '6', label: 'Last 6 months', range: () => { const n = new Date(); return { from: toInput(new Date(n.getFullYear(), n.getMonth() - 5, 1)), to: toInput(n) } } },
  { id: 'year', label: 'This year', range: () => { const n = new Date(); return { from: toInput(new Date(n.getFullYear(), 0, 1)), to: toInput(n) } } },
]

const defaultPreset = (tab) => (tab === 'financial' ? MONTH_PRESETS.find((p) => p.id === '6') : DAY_PRESETS.find((p) => p.id === '30'))

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

/** Loads one report; shows loading, error and the content. */
function ReportFrame({ fetcher, keyPart, children }) {
  const { data, error, loading, reload } = useFetch(fetcher, keyPart)
  if (error && !data) return <div className="card"><ErrorState error={error} onRetry={reload} /></div>
  if (!data && loading) return <div className="card"><Spinner label="Building the report..." /></div>
  return <div className="report-body" aria-busy={loading}>{children(data)}</div>
}

function ExportButton({ onClick }) {
  return (
    <Button variant="secondary" onClick={onClick}>
      <Icon name="file" size={16} /> Export CSV
    </Button>
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

// ---------------------------------------------------------------- utilization

function UtilizationReport({ from, to }) {
  return (
    <ReportFrame fetcher={(signal) => reportsApi.utilization({ from, to }, signal)} keyPart={`util-${from}-${to}`}>
      {(report) => {
        const maxHours = Math.max(1, ...report.organizations.map((o) => o.employeeHours))
        return (
          <>
            <section className="finance-tiles">
              <Tile label="Employee-hours worked" value={report.totalEmployeeHours.toLocaleString()} caption={`over ${Math.round(report.periodHours)} hours`} />
              <Tile label="Active employees" value={report.snapshot.activeEmployees} caption="right now" />
              <Tile label="Allocated now" value={report.snapshot.allocatedNow} caption={`${report.snapshot.allocationRatePct}% of active employees`} tone="gold" />
              <Tile label="Available now" value={report.snapshot.availableNow} caption="ready for allocation" />
            </section>

            <Section
              title="By organization"
              action={
                <ExportButton
                  onClick={() =>
                    downloadCsv(`utilization-${from}-to-${to}.csv`, ['Organization', 'Employees', 'Employee-hours', 'Peak at once', 'Average at once', 'Contract min', 'Contract max', 'Utilization %'],
                      report.organizations.map((o) => [o.orgName, o.employees, o.employeeHours, o.peakConcurrent, o.avgConcurrent, o.contractMin ?? '', o.contractMax ?? '', o.utilizationPct ?? '']))
                  }
                />
              }
            >
              {report.organizations.length === 0 ? (
                <EmptyState icon="chart" title="No data" text="No organization had employees allocated in this period." />
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Organization</th>
                        <th className="num">Employees</th>
                        <th>Employee-hours</th>
                        <th className="num">Peak at once</th>
                        <th className="num">Average at once</th>
                        <th className="num">Contract (min – max)</th>
                        <th>Utilization of contract max</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.organizations.map((org) => (
                        <tr key={org.orgId}>
                          <td>
                            <Link className="person__name" to={`/admin/organizations/${org.orgId}`}>
                              {org.orgName}
                            </Link>
                          </td>
                          <td className="num">{org.employees}</td>
                          <td className="report-cell">
                            <span className="report-cell__value">{org.employeeHours.toLocaleString()}</span>
                            <Bar value={org.employeeHours} max={maxHours} label={`${org.employeeHours} employee-hours`} />
                          </td>
                          <td className="num">{org.peakConcurrent}</td>
                          <td className="num">{org.avgConcurrent}</td>
                          <td className="num">{org.contractMax != null ? `${org.contractMin ?? '—'} – ${org.contractMax}` : <span className="cell-muted">No active contract</span>}</td>
                          <td className="report-cell">
                            {org.utilizationPct != null ? (
                              <>
                                <span className="report-cell__value">{org.utilizationPct}%</span>
                                <Bar value={org.utilizationPct} max={100} label={`${org.utilizationPct}% utilization`} />
                              </>
                            ) : (
                              <span className="cell-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <Section title="Workforce right now">
              <div className="card__body chip-list">
                {report.snapshot.byStatus.length === 0 ? (
                  <span className="cell-muted">No active employees.</span>
                ) : (
                  report.snapshot.byStatus.map((item) => (
                    <span className="chip" key={item.status}>
                      {humanize(item.status)}: <strong>{item.count}</strong>
                    </span>
                  ))
                )}
              </div>
            </Section>
          </>
        )
      }}
    </ReportFrame>
  )
}

// ---------------------------------------------------------------- allocation

function AllocationReport({ from, to }) {
  return (
    <ReportFrame fetcher={(signal) => reportsApi.allocations({ from, to }, signal)} keyPart={`alloc-${from}-${to}`}>
      {(report) => {
        const maxAction = Math.max(1, ...report.byAction.map((a) => a.count))
        const maxDaily = Math.max(1, ...report.daily.map((d) => d.count))
        return (
          <>
            <section className="finance-tiles">
              <Tile label="Allocation events" value={report.totalEvents} caption="allocations, moves and releases" />
              <Tile label="Done by AI" value={report.aiCount} caption={`${report.manualCount} done manually`} />
              <Tile label="Manual overrides" value={report.overrides} caption="contract rules overridden by an admin" tone={report.overrides > 0 ? 'danger' : ''} />
              <Tile label="New allocations" value={report.startedNormal + report.startedTemporary} caption={`${report.startedTemporary} temporary (shared)`} tone="gold" />
            </section>

            <div className="details-grid">
              <Section title="What happened">
                {report.byAction.length === 0 ? (
                  <EmptyState icon="swap" title="No events" />
                ) : (
                  <ul className="report-list">
                    {report.byAction.map((item) => (
                      <li key={item.action}>
                        <span>{humanize(item.action)}</span>
                        <Bar value={item.count} max={maxAction} label={`${item.count} ${item.action}`} />
                        <strong>{item.count}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Events per day">
                {report.daily.length === 0 ? (
                  <EmptyState icon="chart" title="No events" />
                ) : (
                  <div className="column-chart" role="img" aria-label="Allocation events per day">
                    {report.daily.map((day) => (
                      <div className="column-chart__col" key={day.date} title={`${formatDate(day.date)}: ${day.count}`}>
                        <span className="column-chart__bar" style={{ height: `${(day.count / maxDaily) * 100}%` }} />
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>

            <Section
              title="By organization"
              action={
                <ExportButton
                  onClick={() => downloadCsv(`allocations-${from}-to-${to}.csv`, ['Organization', 'Employees received', 'Employees lost'], report.byOrganization.map((o) => [o.orgName, o.received, o.lost]))}
                />
              }
            >
              {report.byOrganization.length === 0 ? (
                <EmptyState icon="building" title="No movements" />
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Organization</th>
                        <th className="num">Received</th>
                        <th className="num">Lost (moved or released)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byOrganization.map((org) => (
                        <tr key={org.orgId}>
                          <td>{org.orgName}</td>
                          <td className="num">{org.received}</td>
                          <td className="num">{org.lost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        )
      }}
    </ReportFrame>
  )
}

// ---------------------------------------------------------------- financial

function FinancialReport({ from, to }) {
  return (
    <ReportFrame fetcher={(signal) => reportsApi.financial({ from, to }, signal)} keyPart={`fin-${from}-${to}`}>
      {(report) => {
        const maxMonth = Math.max(1, ...report.months.flatMap((m) => [m.collectedPkr, m.payrollPkr]))
        const amounts = (list) => (list.length === 0 ? '—' : list.map((i) => formatCurrencyWhole(i.amount, i.currency)).join(' · '))
        return (
          <>
            <section className="finance-tiles">
              <Tile label="Collected" value={formatCurrencyWhole(report.totalCollectedPkr, 'PKR')} caption="payments at their stored rates" />
              <Tile label="Payroll" value={formatCurrencyWhole(report.totalPayrollPkr, 'PKR')} caption="approved or paid runs" />
              <Tile label="Profit" value={formatCurrencyWhole(report.totalProfitPkr, 'PKR')} caption="collected − payroll (calculated)" tone={report.totalProfitPkr < 0 ? 'danger' : 'gold'} />
              <Tile label="Outstanding now" value={<span className="finance-tile__value--text">{amounts(report.outstanding)}</span>} caption={report.overdue.length > 0 ? `overdue: ${amounts(report.overdue)}` : 'nothing overdue'} tone={report.overdue.length > 0 ? 'danger' : ''} />
            </section>

            <Section
              title="Month by month"
              action={
                <ExportButton
                  onClick={() =>
                    downloadCsv(`financial-${from}-to-${to}.csv`, ['Month', 'Invoiced', 'Collected (PKR)', 'Payroll (PKR)', 'Profit (PKR)'],
                      report.months.map((m) => [formatMonth(m.year, m.month), m.invoiced.map((i) => `${i.amount} ${i.currency}`).join(' + '), m.collectedPkr, m.payrollPkr, m.profitPkr]))
                  }
                />
              }
            >
              <div className="card__body">
                <div className="column-chart column-chart--paired" role="img" aria-label="Collected and payroll per month">
                  {report.months.map((m) => (
                    <div className="column-chart__col column-chart__col--pair" key={`${m.year}-${m.month}`} title={`${formatMonth(m.year, m.month)}: collected ${formatCurrencyWhole(m.collectedPkr, 'PKR')}, payroll ${formatCurrencyWhole(m.payrollPkr, 'PKR')}`}>
                      <span className="column-chart__bar column-chart__bar--gold" style={{ height: `${(m.collectedPkr / maxMonth) * 100}%` }} />
                      <span className="column-chart__bar column-chart__bar--navy" style={{ height: `${(m.payrollPkr / maxMonth) * 100}%` }} />
                    </div>
                  ))}
                </div>
                <p className="report-legend">
                  <span className="report-legend__dot report-legend__dot--gold" /> Collected <span className="report-legend__dot report-legend__dot--navy" /> Payroll
                </p>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="num">Invoiced</th>
                      <th className="num">Collected</th>
                      <th className="num">Payroll</th>
                      <th className="num">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.months.map((m) => (
                      <tr key={`${m.year}-${m.month}`}>
                        <td>{formatMonth(m.year, m.month)}</td>
                        <td className="num">{amounts(m.invoiced)}</td>
                        <td className="num">{formatCurrency(m.collectedPkr, 'PKR')}</td>
                        <td className="num">{formatCurrency(m.payrollPkr, 'PKR')}</td>
                        <td className="num">
                          <strong style={{ color: m.profitPkr < 0 ? 'var(--danger)' : 'inherit' }}>{formatCurrency(m.profitPkr, 'PKR')}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Revenue by organization">
              {report.byOrganization.length === 0 ? (
                <EmptyState icon="building" title="No payments in this period" />
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Organization</th>
                        <th className="num">Invoices issued</th>
                        <th className="num">Collected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byOrganization.map((org) => (
                        <tr key={org.orgId}>
                          <td>{org.orgName}</td>
                          <td className="num">{org.invoicesIssued}</td>
                          <td className="num">{formatCurrency(org.collectedPkr, 'PKR')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        )
      }}
    </ReportFrame>
  )
}

// ---------------------------------------------------------------- page

/** System-wide reports. Everything is calculated from the live data for the chosen period. */
function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS.find((item) => item.id === searchParams.get('tab'))?.id ?? 'utilization'

  const [preset, setPreset] = useState(defaultPreset(tab).id)
  const [range, setRange] = useState(defaultPreset(tab).range())

  const presets = tab === 'financial' ? MONTH_PRESETS : DAY_PRESETS
  const invalid = range.from && range.to && range.from > range.to

  function changeTab(next) {
    setSearchParams({ tab: next }, { replace: true })
    const fallback = defaultPreset(next)
    setPreset(fallback.id)
    setRange(fallback.range())
  }

  function choosePreset(item) {
    setPreset(item.id)
    setRange(item.range())
  }

  function editDate(field) {
    return (event) => {
      setPreset('custom')
      setRange((current) => ({ ...current, [field]: event.target.value }))
    }
  }

  const Report = { utilization: UtilizationReport, allocations: AllocationReport, financial: FinancialReport }[tab]

  return (
    <div className="page">
      <PageHeader title="Reports" description="System-wide reports for any period. Export a table as CSV to open it in Excel." />

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
              <button key={item.id} type="button" className={`report-preset ${preset === item.id ? 'is-active' : ''}`} onClick={() => choosePreset(item)}>
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

export default ReportsPage
