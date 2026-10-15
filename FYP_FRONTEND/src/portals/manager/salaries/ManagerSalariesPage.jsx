import { useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../../../components/ui/Avatar.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { MONTH_OPTIONS } from '../../../constants/billing.js'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { managerApi, managerSalariesApi } from '../../../services/manager/managerService.js'
import { formatCurrency, formatCurrencyWhole, formatDate } from '../../../utils/format.js'
import '../../admin/finance/FinanceTiles.css'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import { SalaryStatusBadge } from './SalaryStatusBadge.jsx'

const PAGE_SIZE = 10

const STATUS_OPTIONS = [
  { value: 'Paid', label: 'Paid' },
  { value: 'Approved', label: 'Approved, waiting to be paid' },
  { value: 'Draft', label: 'Being prepared' },
  { value: 'NotProcessed', label: 'Not processed yet' },
]

/** Organization Manager: the salary status of the employees working for my organizations, month by month. Read only. */
function ManagerSalariesPage() {
  const now = new Date()
  const [year, setYear] = useState(String(now.getFullYear()))
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [search, setSearch] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebouncedValue(search)
  const params = { year, month, search: debouncedSearch.trim(), organizationId, status, page, pageSize: PAGE_SIZE }

  const { data, error, loading, reload } = useFetch((signal) => managerSalariesApi.list(params, signal), JSON.stringify(params))
  const { data: overview } = useFetch((signal) => managerApi.overview(signal), 'manager-overview')

  const organizations = overview?.organizations ?? []
  const organizationOptions = organizations.map((org) => ({ value: String(org.organizationId), label: org.name }))
  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((value) => ({ value: String(value), label: String(value) }))
  const items = data?.items ?? []
  const summary = data?.summary
  const filtered = Boolean(debouncedSearch || organizationId || status)

  const changeFilter = (setter) => (event) => {
    setter(event.target.value)
    setPage(1)
  }

  return (
    <div className="page">
      <PageHeader title="Salary Status" description="Whether the salary of the employees working for your organizations is being prepared, approved or paid, month by month." />

      {summary && (
        <section className="finance-tiles" aria-label="Salary overview">
          <article className="card finance-tile">
            <p className="finance-tile__label">Paid</p>
            <p className="finance-tile__value">{summary.paid}</p>
            <p className="finance-tile__caption">of {summary.totalEmployees} employees</p>
          </article>
          <article className={`card finance-tile ${summary.approved > 0 ? 'finance-tile--gold' : ''}`}>
            <p className="finance-tile__label">Approved, waiting to be paid</p>
            <p className="finance-tile__value">{summary.approved}</p>
          </article>
          <article className="card finance-tile">
            <p className="finance-tile__label">Being prepared</p>
            <p className="finance-tile__value">{summary.draft}</p>
          </article>
          <article className={`card finance-tile ${summary.notProcessed > 0 ? 'finance-tile--danger' : ''}`}>
            <p className="finance-tile__label">Not processed yet</p>
            <p className="finance-tile__value">{summary.notProcessed}</p>
            <p className="finance-tile__caption">{summary.withoutSalary > 0 ? `${summary.withoutSalary} have no salary set` : 'all have a salary set'}</p>
          </article>
          {summary.amounts.map((row) => (
            <article className="card finance-tile" key={row.currency}>
              <p className="finance-tile__label">Salary amounts ({row.currency})</p>
              <p className="finance-tile__value">{formatCurrencyWhole(row.paid, row.currency)}</p>
              <p className="finance-tile__caption">paid · {formatCurrencyWhole(row.toPay, row.currency)} still to pay</p>
            </article>
          ))}
        </section>
      )}

      <section className="card">
        <div className="toolbar">
          <TextField
            className="toolbar__search"
            label="Search employees"
            icon="search"
            placeholder="Search by name"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <SelectField className="toolbar__filter" label="Month" value={month} onChange={changeFilter(setMonth)} options={MONTH_OPTIONS} />
          <SelectField className="toolbar__filter" label="Year" value={year} onChange={changeFilter(setYear)} options={yearOptions} />
          <SelectField className="toolbar__filter" label="Status" value={status} onChange={changeFilter(setStatus)} options={STATUS_OPTIONS} placeholder="All" />
          {organizations.length > 1 && (
            <SelectField className="toolbar__filter" label="Organization" value={organizationId} onChange={changeFilter(setOrganizationId)} options={organizationOptions} placeholder="All organizations" />
          )}
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading salaries..." />
        ) : items.length === 0 ? (
          <EmptyState icon="users" title="No employees found" text={filtered ? 'Try changing or clearing the filters.' : 'Employees working for your organizations will be listed here.'} />
        ) : (
          <>
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Organization</th>
                    <th className="num">Monthly salary</th>
                    <th>Status</th>
                    <th className="num">Paid / to pay</th>
                    <th>Paid on</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.employeeId}>
                      <td>
                        <div className="person">
                          <Avatar userId={row.userId} name={row.fullName} hasPicture={row.hasPicture} />
                          <span>
                            <Link className="person__name" to={`/manager/employees/${row.employeeId}`}>
                              {row.fullName}
                            </Link>
                            <span className="person__sub">EMP-{String(row.employeeId).padStart(3, '0')}</span>
                          </span>
                        </div>
                      </td>
                      <td>{row.orgName || <span className="cell-muted">—</span>}</td>
                      <td className="num">{row.monthlySalary != null ? formatCurrency(row.monthlySalary, row.salaryCurrency || 'PKR') : <Badge tone="warning">No salary set</Badge>}</td>
                      <td>
                        <SalaryStatusBadge status={row.status} label={row.statusLabel} />
                      </td>
                      <td className="num">
                        {row.totalAmount != null ? formatCurrency(row.totalAmount, row.payrollCurrency || 'PKR') : <span className="cell-muted">—</span>}
                        {row.totalAmount != null && (row.overtimeAmount > 0 || row.adjustment !== 0) && (
                          <span className="person__sub">
                            {row.overtimeAmount > 0 && `overtime ${formatCurrency(row.overtimeAmount, row.payrollCurrency || 'PKR')}`}
                            {row.adjustment !== 0 && ` ${row.adjustment > 0 ? '+' : ''}${row.adjustment} adjustment`}
                          </span>
                        )}
                      </td>
                      <td className="cell-muted">{row.paidAt ? formatDate(row.paidAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </section>
    </div>
  )
}

export default ManagerSalariesPage
