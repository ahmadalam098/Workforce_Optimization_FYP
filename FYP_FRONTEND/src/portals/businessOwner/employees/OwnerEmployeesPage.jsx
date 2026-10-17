import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Avatar from '../../../components/ui/Avatar.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { businessOwnerApi } from '../../../services/businessOwner/businessOwnerService.js'
import { formatDate } from '../../../utils/format.js'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import { ActiveBadge, AvailabilityBadge } from '../../admin/shared/StatusBadge.jsx'
import '../../admin/finance/FinanceTiles.css'

const PAGE_SIZE = 10

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active employees' },
  { value: 'inactive', label: 'Inactive employees' },
]

/** Business Owner: every employee, with a filter for active and inactive ones. Opened from the Employees card on the dashboard. */
function OwnerEmployeesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = ['active', 'inactive'].includes(searchParams.get('status')) ? searchParams.get('status') : ''
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebouncedValue(search)
  const params = { status, search: debouncedSearch.trim(), page, pageSize: PAGE_SIZE }
  const { data, error, loading, reload } = useFetch((signal) => businessOwnerApi.employees(params, signal), JSON.stringify(params))

  const items = data?.items ?? []
  const counts = data?.counts
  const filtered = Boolean(status || debouncedSearch)

  function changeStatus(value) {
    setSearchParams(value ? { status: value } : {}, { replace: true })
    setPage(1)
  }

  return (
    <div className="page">
      <Link className="back-link" to="/owner/dashboard">
        <Icon name="arrowLeft" size={16} /> Back to the dashboard
      </Link>
      <PageHeader title="Employees" description="All the employees of the business. Use the filter to see only the active or only the inactive ones." />

      {counts && (
        <section className="finance-tiles" aria-label="Overview">
          <article className="card finance-tile">
            <p className="finance-tile__label">All employees</p>
            <p className="finance-tile__value">{counts.total}</p>
          </article>
          <article className="card finance-tile">
            <p className="finance-tile__label">Active</p>
            <p className="finance-tile__value">{counts.active}</p>
          </article>
          <article className="card finance-tile">
            <p className="finance-tile__label">Inactive</p>
            <p className="finance-tile__value">{counts.inactive}</p>
          </article>
        </section>
      )}

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
          <SelectField className="toolbar__filter" label="Status" value={status} onChange={(event) => changeStatus(event.target.value)} options={STATUS_OPTIONS} placeholder="All employees" />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading employees..." />
        ) : items.length === 0 ? (
          <EmptyState icon="users" title="No employees found" text={filtered ? 'Try changing or clearing the filters.' : 'There are no employees yet.'} />
        ) : (
          <>
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Works for</th>
                    <th>Home organization</th>
                    <th>Availability</th>
                    <th>Account</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((employee) => (
                    <tr key={employee.employeeId} className={employee.isActive ? '' : 'is-inactive'}>
                      <td>
                        <div className="person">
                          <Avatar userId={employee.userId} name={employee.fullName} hasPicture={employee.hasPicture} size="sm" />
                          <span>
                            <span className="person__name">{employee.fullName}</span>
                            <span className="person__sub">{employee.email}</span>
                          </span>
                        </div>
                      </td>
                      <td>{employee.workingOrganization || <span className="cell-muted">Not allocated</span>}</td>
                      <td className="cell-muted">{employee.homeOrganization || '—'}</td>
                      <td>{employee.availabilityStatus ? <AvailabilityBadge status={employee.availabilityStatus} /> : '—'}</td>
                      <td>
                        <ActiveBadge isActive={employee.isActive} />
                      </td>
                      <td className="cell-muted">{employee.joiningDate ? formatDate(employee.joiningDate) : '—'}</td>
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

export default OwnerEmployeesPage
