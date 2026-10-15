import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Avatar from '../../../components/ui/Avatar.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { AVAILABILITY_OPTIONS } from '../../../constants/employee.js'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { managerAllocationsApi, managerApi } from '../../../services/manager/managerService.js'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import ViewButton from '../../admin/shared/ViewButton.jsx'
import { AvailabilityBadge } from '../../admin/shared/StatusBadge.jsx'
import ManagerAllocationModal from './ManagerAllocationModal.jsx'

const PAGE_SIZE = 10

const VIEW_OPTIONS = [
  { value: 'free', label: 'Free to assign' },
  { value: 'mine', label: 'My employees' },
]

/**
 * Organization Manager: the employee pool with manual allocation.
 * Free employees can be assigned to one of the manager's organizations; employees working for those organizations
 * can be moved to another of them or removed (they then become free in the pool again).
 */
function ManagerEmployeePoolPage() {
  const [search, setSearch] = useState('')
  const [availability, setAvailability] = useState('')
  const [skillId, setSkillId] = useState('')
  // The dashboard cards link here with ?view=free or ?view=mine
  const [searchParams] = useSearchParams()
  const [view, setView] = useState(['free', 'mine'].includes(searchParams.get('view')) ? searchParams.get('view') : '')
  const [organizationId, setOrganizationId] = useState('')
  const [page, setPage] = useState(1)
  const [action, setAction] = useState(null) // { mode, employee }
  const [notice, setNotice] = useFlashNotice()

  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), availability, skillId, view, organizationId, page, pageSize: PAGE_SIZE }

  const { data, error, loading, reload } = useFetch((signal) => managerAllocationsApi.pool(params, signal), JSON.stringify(params))
  const { data: skills } = useFetch((signal) => managerAllocationsApi.skills(signal), 'manager-skills')
  const { data: overview } = useFetch((signal) => managerApi.overview(signal), 'manager-overview')

  const organizations = overview?.organizations ?? []
  const organizationOptions = organizations.map((org) => ({ value: String(org.organizationId), label: org.name }))
  const skillOptions = (skills ?? []).map((skill) => ({ value: String(skill.skillId), label: skill.name }))
  const items = data?.items ?? []
  const filtered = Boolean(debouncedSearch || availability || skillId || view || organizationId)

  const changeFilter = (setter) => (event) => {
    setter(event.target.value)
    setPage(1)
  }

  function handleDone(message) {
    setAction(null)
    setNotice(message)
    reload()
  }

  return (
    <div className="page">
      <PageHeader
        title="Employee Pool"
        description="See every employee, assign free employees to your organizations, and move or remove the ones working for you."
      />
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
          <SelectField className="toolbar__filter" label="Show" value={view} onChange={changeFilter(setView)} options={VIEW_OPTIONS} placeholder="All employees" />
          {organizations.length > 1 && (
            <SelectField className="toolbar__filter" label="My organization" value={organizationId} onChange={changeFilter(setOrganizationId)} options={organizationOptions} placeholder="All organizations" />
          )}
          <SelectField className="toolbar__filter" label="Availability" value={availability} onChange={changeFilter(setAvailability)} options={AVAILABILITY_OPTIONS} placeholder="All statuses" />
          <SelectField className="toolbar__filter" label="Skill" value={skillId} onChange={changeFilter(setSkillId)} options={skillOptions} placeholder="All skills" />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading employees..." />
        ) : items.length === 0 ? (
          <EmptyState icon="users" title="No employees found" text={filtered ? 'Try changing or clearing the filters.' : 'There are no active employees in the pool yet.'} />
        ) : (
          <>
            {error && <ErrorState error={error} onRetry={reload} />}
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Skills</th>
                    <th>Status</th>
                    <th>Shift</th>
                    <th>Home organization</th>
                    <th>Working at</th>
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
                            <Link className="person__name" to={`/manager/employees/${employee.employeeId}`}>
                              {employee.fullName}
                            </Link>
                            <span className="person__sub">
                              EMP-{String(employee.employeeId).padStart(3, '0')} · {employee.email}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td>
                        {employee.skills.length > 0 ? (
                          <div className="chip-list">
                            {employee.skills.map((skill) => (
                              <span className="chip" key={skill}>
                                {skill}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="cell-muted">—</span>
                        )}
                      </td>
                      <td>
                        <AvailabilityBadge status={employee.availabilityStatus} />
                      </td>
                      <td>{employee.shiftName || <span className="cell-muted">—</span>}</td>
                      <td>{employee.homeOrgName || <span className="cell-muted">Central pool</span>}</td>
                      <td>
                        {employee.isAllocated ? (
                          <>
                            {employee.workingOrgName}
                            {employee.canManage && <span className="person__sub">Your organization</span>}
                          </>
                        ) : (
                          <Badge tone="success">Free</Badge>
                        )}
                      </td>
                      <td>
                        <ViewButton to={`/manager/employees/${employee.employeeId}`} label={`View ${employee.fullName}`} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {!employee.isAllocated && (
                            <Button onClick={() => setAction({ mode: 'assign', employee })} disabled={organizations.length === 0}>
                              Assign
                            </Button>
                          )}
                          {employee.canManage && (
                            <>
                              <Button variant="secondary" onClick={() => setAction({ mode: 'move', employee })}>
                                Move
                              </Button>
                              <Button variant="secondary" onClick={() => setAction({ mode: 'release', employee })}>
                                Remove
                              </Button>
                            </>
                          )}
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

      {action && (
        <ManagerAllocationModal
          mode={action.mode}
          employee={action.employee}
          organizations={organizations}
          onClose={() => setAction(null)}
          onDone={handleDone}
        />
      )}
    </div>
  )
}

export default ManagerEmployeePoolPage
