import Avatar from '../../../components/ui/Avatar.jsx'
import { useState } from 'react'
import Badge from '../../../components/ui/Badge.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { organizationsApi, salariesApi } from '../../../services/admin/adminService.js'
import { formatCurrency, formatDate } from '../../../utils/format.js'
import Notice from '../shared/Notice.jsx'
import PageHeader from '../shared/PageHeader.jsx'
import { SalaryFormModal, SalaryHistoryModal, SalaryMonthsModal } from './SalaryModals.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'
import ViewButton from '../shared/ViewButton.jsx'

const PAGE_SIZE = 10

const THIS_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = [THIS_YEAR, THIS_YEAR - 1, THIS_YEAR - 2, THIS_YEAR - 3].map((value) => ({ value: String(value), label: String(value) }))

const SALARY_OPTIONS = [
  { value: 'true', label: 'Salary set' },
  { value: 'false', label: 'No salary yet' },
]

/** What each active employee is paid (monthly salary), and for the chosen year how many months were paid and how many are still to pay. */
function SalariesPage() {
  const [search, setSearch] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [hasSalary, setHasSalary] = useState('')
  const [page, setPage] = useState(1)
  const [formTarget, setFormTarget] = useState(null)
  const [historyTarget, setHistoryTarget] = useState(null)
  const [monthsTarget, setMonthsTarget] = useState(null)
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [notice, setNotice] = useState('')

  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), organizationId, hasSalary, year, page, pageSize: PAGE_SIZE }
  const { data, error, loading, reload } = useFetch((signal) => salariesApi.list(params, signal), JSON.stringify(params))
  const { data: organizations } = useFetch((signal) => organizationsApi.lookup(signal), 'organizations')

  const organizationOptions = (organizations ?? []).map((org) => ({ value: String(org.organizationId), label: org.name }))
  const items = data?.items ?? []
  const filtered = Boolean(debouncedSearch || organizationId || hasSalary)

  return (
    <div className="page">
      <PageHeader title="Salaries" description="Monthly salary of every active employee, and which months were paid and which are still to pay. Changes are dated and the history is kept." />

      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card">
        <div className="toolbar">
          <TextField
            className="toolbar__search"
            label="Search employees"
            icon="search"
            placeholder="Search by name or email"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <SelectField className="toolbar__filter" label="Organization" value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); setPage(1) }} options={organizationOptions} placeholder="All organizations" />
          <SelectField className="toolbar__filter" label="Year" value={year} onChange={(event) => { setYear(event.target.value); setPage(1) }} options={YEAR_OPTIONS} />
          <SelectField className="toolbar__filter" label="Salary" value={hasSalary} onChange={(event) => { setHasSalary(event.target.value); setPage(1) }} options={SALARY_OPTIONS} placeholder="All employees" />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading salaries..." />
        ) : items.length === 0 ? (
          <EmptyState icon="users" title="No employees found" text={filtered ? 'Try changing or clearing the filters.' : 'Add employees first, then set their salaries here.'} />
        ) : (
          <>
            {error && <ErrorState error={error} onRetry={reload} />}
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Organization</th>
                    <th className="num">Monthly salary</th>
                    <th>Since</th>
                    <th className="num">Months paid</th>
                    <th className="num">Months to pay</th>
                    <th>View</th>
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((employee) => (
                    <tr key={employee.employeeId}>
                      <td>
                        <div className="person">
                          <Avatar userId={employee.userId} name={employee.fullName} hasPicture={employee.hasPicture} />
                          <span>
                            <span className="person__name">{employee.fullName}</span>
                            <span className="person__sub">{employee.email}</span>
                          </span>
                        </div>
                      </td>
                      <td>{employee.organizationName || <span className="cell-muted">Central pool</span>}</td>
                      <td className="num">{employee.monthlySalary != null ? formatCurrency(employee.monthlySalary, employee.currency) : <Badge tone="warning">Not set</Badge>}</td>
                      <td className="cell-muted cell-date">{employee.effectiveFrom ? formatDate(employee.effectiveFrom) : '—'}</td>
                      <td className="num">{employee.monthlySalary != null ? <Badge tone="success">{employee.paidMonths}</Badge> : '—'}</td>
                      <td className="num">{employee.monthlySalary != null ? <Badge tone={employee.pendingMonths > 0 ? 'warning' : 'neutral'}>{employee.pendingMonths}</Badge> : '—'}</td>
                      <td>
                        <ViewButton to={`/admin/employees/${employee.employeeId}`} label={`View ${employee.fullName}`} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="icon-btn" onClick={() => setFormTarget(employee)} aria-label={`${employee.monthlySalary != null ? 'Change' : 'Set'} salary of ${employee.fullName}`} title={employee.monthlySalary != null ? 'Change salary' : 'Set salary'}>
                            <Icon name="edit" size={17} />
                          </button>
                          <button type="button" className="icon-btn" onClick={() => setMonthsTarget(employee)} aria-label={`Paid and unpaid months of ${employee.fullName}`} title="Month by month">
                            <Icon name="chart" size={17} />
                          </button>
                          <button type="button" className="icon-btn" onClick={() => setHistoryTarget(employee)} aria-label={`Salary history of ${employee.fullName}`} title="History">
                            <Icon name="history" size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </section>

      {formTarget && (
        <SalaryFormModal
          employee={formTarget}
          onClose={() => setFormTarget(null)}
          onSaved={(message) => {
            setFormTarget(null)
            setNotice(message)
            reload()
          }}
        />
      )}

      {historyTarget && <SalaryHistoryModal employee={historyTarget} onClose={() => setHistoryTarget(null)} />}
      {monthsTarget && <SalaryMonthsModal employee={monthsTarget} initialYear={year} onClose={() => setMonthsTarget(null)} />}
    </div>
  )
}

export default SalariesPage
