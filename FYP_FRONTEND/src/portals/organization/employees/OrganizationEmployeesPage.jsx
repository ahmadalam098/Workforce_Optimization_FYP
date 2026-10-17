import { useState } from 'react'
import Avatar from '../../../components/ui/Avatar.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { Stars } from '../../../components/reviews/Stars.jsx'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { organizationEmployeesApi } from '../../../services/organization/organizationService.js'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import ViewButton from '../../admin/shared/ViewButton.jsx'

const FILTERS = [
  { value: 'toReview', label: 'Waiting for your review' },
  { value: 'working', label: 'Working for you now' },
  { value: 'former', label: 'Worked for you before' },
]

/** Organization: the employees who work (or worked) for it, with their rating, and a way to review each of them. */
function OrganizationEmployeesPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const debounced = useDebouncedValue(search)
  const params = { search: debounced.trim(), status }
  const { data, error, loading, reload } = useFetch((signal) => organizationEmployeesApi.list(params, signal), JSON.stringify(params))
  const items = data ?? []

  return (
    <div className="page">
      <PageHeader title="Employees" description="The employees who work for you. Review each one with a rating and a comment; your manager sees it and acts on bad reviews. You also see what other organizations said about them." />

      <section className="card">
        <div className="toolbar">
          <TextField className="toolbar__search" label="Search employees" icon="search" placeholder="Search by name" value={search} onChange={(event) => setSearch(event.target.value)} />
          <SelectField className="toolbar__filter" label="Show" value={status} onChange={(event) => setStatus(event.target.value)} options={FILTERS} placeholder="All employees" />
        </div>
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading employees..." />
        ) : items.length === 0 ? (
          <EmptyState icon="users" title="No employees" text={search || status ? 'Nothing matches.' : 'No employee has been allocated to your organization yet.'} />
        ) : (
          <div className="table-wrap" aria-busy={loading}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Rating (all organizations)</th>
                  <th>Your last review</th>
                  <th>Status</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>
                {items.map((employee) => (
                  <tr key={employee.employeeId}>
                    <td>
                      <div className="person">
                        <Avatar userId={employee.userId} name={employee.fullName} hasPicture={employee.hasPicture} />
                        <span>
                          <strong className="person__name">{employee.fullName}</strong>
                          <span className="person__sub">{employee.homeOrgName || 'Central pool'}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <Stars value={employee.rating} />
                      <span className="person__sub">{employee.reviewCount} review{employee.reviewCount === 1 ? '' : 's'}</span>
                    </td>
                    <td>{employee.myRating != null ? <Stars value={employee.myRating} /> : <span className="cell-muted">Not reviewed</span>}</td>
                    <td>
                      {employee.workingNow ? <Badge tone="success">Working for you</Badge> : <Badge tone="neutral">Not now</Badge>}{' '}
                      {employee.canReview && <Badge tone="warning">Review waiting</Badge>}
                    </td>
                    <td>
                      <ViewButton to={`/organization/employees/${employee.employeeId}`} label={`View ${employee.fullName}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default OrganizationEmployeesPage
