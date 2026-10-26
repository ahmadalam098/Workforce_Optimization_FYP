import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Badge from '../../../components/ui/Badge.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useAuth } from '../../../context/useAuth.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { DATA_CHANGED_EVENT } from '../../../services/apiClient.js'
import { businessOwnerApi } from '../../../services/businessOwner/businessOwnerService.js'
import { formatCurrency, formatCurrencyWhole, formatNumber } from '../../../utils/format.js'
import { greeting, STATUS_COLORS } from '../../admin/dashboard/dashboardUtils.js'
import StatCard from '../../admin/shared/StatCard.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import '../../admin/dashboard/AdminDashboardPage.css'
import { ActivityChart } from './OwnerCharts.jsx'
import './OwnerDashboard.css'

const PERIOD_OPTIONS = [
  { value: 'allTime', label: 'All time' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'thisYear', label: 'This year' },
]

const REFRESH_MS = 10000

/** "PKR 1,200 + USD 500", or a dash when nothing is pending. */
function amountsText(list, whole = false) {
  if (!list || list.length === 0) return '—'
  return list.map((entry) => (whole ? formatCurrencyWhole : formatCurrency)(entry.amount, entry.currency || 'PKR')).join(' + ')
}

/**
 * First page of the Business Owner portal. Same layout, colours and fonts as the Admin and Organization Manager dashboards. Every figure is read
 * from the other modules (payments, expenses, employees, allocations), so it changes when they change: the page asks again every few seconds,
 * when something is saved anywhere, and when the tab is shown again.
 */
function OwnerDashboardPage() {
  const { user } = useAuth()
  const [period, setPeriod] = useState('allTime')
  const { data, error, loading, reload } = useFetch((signal) => businessOwnerApi.dashboard(period, signal), `owner-dashboard-${period}`)

  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) reload()
    }
    const timer = setInterval(refresh, REFRESH_MS)
    window.addEventListener(DATA_CHANGED_EVENT, refresh)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener(DATA_CHANGED_EVENT, refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [reload])

  if (!data && loading) return <Spinner label="Loading dashboard..." />
  if (!data) {
    return (
      <div className="card">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  const firstName = (user?.fullName || 'there').split(' ')[0]
  const { money, employees, organizations, utilization, owners, pendingPayments } = data
  const activeOrganizations = organizations.byStatus.find((entry) => entry.status === 'Active')?.count ?? 0
  const { items: organizationItems, otherCount } = data.allocationByOrganization
  const bars = otherCount > 0 ? [...organizationItems, { orgId: 'other', name: 'Other organizations', count: otherCount }] : organizationItems
  const maxOrgCount = Math.max(1, ...bars.map((item) => item.count))

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div className="dashboard-hero__text">
          <p className="dashboard-hero__eyebrow">{greeting()}</p>
          <h2 className="dashboard-hero__title">Welcome back, {firstName}</h2>
          <p className="dashboard-hero__summary">
            {data.periodLabel}: the business received <strong>{formatCurrencyWhole(money.revenuePkr, 'PKR')}</strong> and paid{' '}
            <strong>{formatCurrencyWhole(money.expensePkr, 'PKR')}</strong>, a {money.profitPkr < 0 ? 'loss' : 'profit'} of{' '}
            <strong>{formatCurrencyWhole(Math.abs(money.profitPkr), 'PKR')}</strong>.
          </p>
          <div className="dashboard-hero__actions">
            <Link to="/owner/employees" className="hero-btn hero-btn--dark">
              <Icon name="users" size={17} /> View employees
            </Link>
          </div>
        </div>

        <div className="dashboard-hero__panel" aria-label="Workforce utilization">
          <p className="dashboard-hero__panel-title">Workforce utilization</p>
          {utilization.activeEmployees === 0 ? (
            <p className="dashboard-hero__panel-empty">No active employees yet.</p>
          ) : (
            <>
              <div className="segment-bar" role="img" aria-label={`${utilization.working} working, ${utilization.free} free in the pool`}>
                <span className="segment-bar__part" style={{ flexGrow: utilization.working, background: STATUS_COLORS.Assigned }} title={`Working: ${utilization.working}`} />
                <span className="segment-bar__part" style={{ flexGrow: utilization.free, background: STATUS_COLORS.Available }} title={`Free in the pool: ${utilization.free}`} />
              </div>
              <ul className="legend">
                <li>
                  <span className="legend__dot" style={{ background: STATUS_COLORS.Assigned }} aria-hidden="true" />
                  <span>Working for an organization</span>
                  <strong>{utilization.working}</strong>
                </li>
                <li>
                  <span className="legend__dot" style={{ background: STATUS_COLORS.Available }} aria-hidden="true" />
                  <span>Free in the pool</span>
                  <strong>{utilization.free}</strong>
                </li>
              </ul>
              <p className="owner-percent">{utilization.percent}% utilized</p>
            </>
          )}
        </div>
      </section>

      <div className="owner-period">
        <span className="owner-live" title="The page refreshes by itself">
          <span className="owner-live__dot" aria-hidden="true" /> Live
        </span>
        <SelectField label="Period" value={period} onChange={(event) => setPeriod(event.target.value)} options={PERIOD_OPTIONS} />
      </div>

      <section className="stat-grid" aria-label="Key metrics">
        <StatCard label="Organizations" value={organizations.total} caption={`${formatNumber(activeOrganizations)} active`} icon="building" />
        <StatCard label="Total employees" value={employees.total} caption={`${formatNumber(employees.active)} active · ${formatNumber(employees.inactive)} inactive`} icon="users" to="/owner/employees" />
        <StatCard label="Total revenue" valueText={formatCurrencyWhole(money.revenuePkr, 'PKR')} caption={`Payments received · ${data.periodLabel} · open balance sheet`} icon="trendUp" to="/owner/balance-sheet" />
        <StatCard label="Total expense" valueText={formatCurrencyWhole(money.expensePkr, 'PKR')} caption={`Expenses written down by the admin · ${data.periodLabel}`} to="/owner/balance-sheet" icon="chart" />
        <StatCard
          label="Profit generated"
          valueText={formatCurrencyWhole(money.profitPkr, 'PKR')}
          caption={money.profitPkr < 0 ? 'A loss: expense is more than revenue' : 'Revenue minus expense'}
          icon="sparkles"
        />
        <StatCard label="Profit sent to owners" valueText={formatCurrencyWhole(money.sentToOwnersPkr, 'PKR')} caption={`${data.periodLabel} · ${formatCurrencyWhole(money.waitingToBeSentPkr, 'PKR')} still waiting to be sent`} icon="send" to="/owner/payouts" />
        <StatCard label="Pending payments" valueText={amountsText(pendingPayments.totals, true)} caption="Issued invoices not fully paid" icon="file" />
      </section>

      {owners.count > 1 && (
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Profit for each business owner</h3>
          </div>
          <div className="card__body">
            <p className="cell-muted">
              The profit of {data.periodLabel.toLowerCase()} ({formatCurrencyWhole(money.profitPkr, 'PKR')}) is shared equally between the {owners.count} active business owners.
              {money.profitPkr <= 0 && ' There is no profit to share right now.'}
            </p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Business owner</th>
                    <th>Email</th>
                    <th className="num">Share of the profit</th>
                  </tr>
                </thead>
                <tbody>
                  {owners.shares.map((owner) => (
                    <tr key={owner.userId}>
                      <td>
                        <strong>{owner.fullName}</strong>
                        {owner.userId === user?.userId && <span className="cell-muted"> (you)</span>}
                      </td>
                      <td className="cell-muted">{owner.email}</td>
                      <td className="num">
                        <strong>{formatCurrencyWhole(owner.sharePkr, 'PKR')}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <div className="dashboard-columns">
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Employees working per organization</h3>
          </div>
          <div className="card__body">
            {bars.length === 0 ? (
              <EmptyState icon="building" title="Nobody is allocated" text="Employees allocated to organizations will show up here." />
            ) : (
              <ul className="bar-list">
                {bars.map((item) => (
                  <li key={item.orgId}>
                    <div className="bar-list__row">
                      <span>{item.name || `Organization #${item.orgId}`}</span>
                      <strong>{item.count}</strong>
                    </div>
                    <div className="bar-list__track">
                      <span className="bar-list__fill" style={{ width: `${(item.count / maxOrgCount) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Allocation activity, last {data.allocationActivity.length} days</h3>
          </div>
          <div className="card__body">
            <ActivityChart days={data.allocationActivity} />
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Pending payments by organization</h3>
        </div>
        <div className="card__body">
          {pendingPayments.byOrganization.length === 0 ? (
            <EmptyState icon="checkCircle" title="Nothing pending" text="Every issued invoice has been paid." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th className="num">Invoices</th>
                    <th className="num">Pending</th>
                    <th className="num">Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPayments.byOrganization.map((row) => (
                    <tr key={`${row.orgId}-${row.currency}`}>
                      <td>
                        <strong>{row.orgName || `Organization #${row.orgId}`}</strong>
                      </td>
                      <td className="num">{row.invoices}</td>
                      <td className="num">{formatCurrency(row.outstanding, row.currency)}</td>
                      <td className="num">{row.overdue > 0 ? <Badge tone="danger">{formatCurrency(row.overdue, row.currency)}</Badge> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default OwnerDashboardPage
