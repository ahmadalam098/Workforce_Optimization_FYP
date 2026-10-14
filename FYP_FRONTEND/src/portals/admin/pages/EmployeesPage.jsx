import Avatar from '../../../components/ui/Avatar.jsx'
import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { employeesApi, organizationsApi, shiftsApi, skillsApi } from '../../../services/adminService.js'
import { emailSentence } from '../../../utils/emailNote.js'
import { formatMoney } from '../../../utils/format.js'
import { AVAILABILITY_OPTIONS } from '../../../constants/employee.js'
import EmployeeFormModal from '../components/EmployeeFormModal.jsx'
import Notice from '../components/Notice.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { EmptyState, ErrorState } from '../components/StateBox.jsx'
import { ActiveBadge, AvailabilityBadge } from '../components/StatusBadge.jsx'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import DeleteForever from '../components/DeleteForever.jsx'
import ViewButton from '../components/ViewButton.jsx'

const PAGE_SIZE = 10

const ACTIVE_OPTIONS = [
  { value: 'true', label: 'Active only' },
  { value: 'false', label: 'Inactive only' },
]

function EmployeesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [active, setActive] = useState('true')
  // The Skills page links here with ?skillId=...
  const [searchParams] = useSearchParams()
  const [skillId, setSkillId] = useState(searchParams.get('skillId') ?? '')
  const [shiftId, setShiftId] = useState('')
  const [page, setPage] = useState(1)
  const [formTarget, setFormTarget] = useState(null) // null | 'new' | the full employee being edited
  const [loadingEditId, setLoadingEditId] = useState(null)
  const [editError, setEditError] = useState('')
  const [toggleTarget, setToggleTarget] = useState(null)
  const [notice, setNotice] = useFlashNotice()

  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), status, organizationId, active, skillId, shiftId, page, pageSize: PAGE_SIZE }

  const { data, error, loading, reload } = useFetch((signal) => employeesApi.list(params, signal), JSON.stringify(params))
  const { data: organizations } = useFetch((signal) => organizationsApi.lookup(signal), 'organizations')
  const { data: skills } = useFetch((signal) => skillsApi.lookup(signal), 'skill-lookup')
  const { data: shifts } = useFetch((signal) => shiftsApi.list(signal), 'shifts')

  const skillOptions = (skills ?? []).map((skill) => ({ value: String(skill.skillId), label: skill.name }))
  const shiftOptions = (shifts ?? []).map((shift) => ({ value: String(shift.shiftId), label: shift.name }))

  const organizationOptions = [
    { value: '0', label: 'Central pool (no organization)' },
    ...(organizations ?? []).map((org) => ({
      value: String(org.organizationId),
      label: org.name || `Organization #${org.organizationId}`,
    })),
  ]

  function changeFilter(setter) {
    return (event) => {
      setter(event.target.value)
      setPage(1)
    }
  }

  // The list rows hold only a summary, so the whole employee (skills, shift ...) is fetched when Edit is pressed.
  async function startEdit(employee) {
    setLoadingEditId(employee.employeeId)
    setEditError('')
    try {
      setFormTarget(await employeesApi.get(employee.employeeId))
    } catch (err) {
      setEditError(err.message)
    } finally {
      setLoadingEditId(null)
    }
  }

  function handleSaved(message) {
    setFormTarget(null)
    setNotice(message)
    reload()
  }

  async function handleToggleActive() {
    const makeActive = !toggleTarget.isActive
    const result = await employeesApi.setActive(toggleTarget.employeeId, makeActive)
    setNotice(`${toggleTarget.fullName} was ${makeActive ? 'activated' : 'deactivated'}.${emailSentence(result)}`)
    setToggleTarget(null)
    reload()
  }

  const items = data?.items ?? []

  return (
    <div className="page">
      <PageHeader
        title="Employee Pool"
        description="Manage every employee, their organization and availability."
        actions={
          <Button onClick={() => navigate('/admin/employees/new')}>
            <Icon name="plus" size={18} /> Add employee
          </Button>
        }
      />

      <Notice message={notice} onClose={() => setNotice('')} />
      {editError && (
        <Alert type="error" onClose={() => setEditError('')}>
          {editError}
        </Alert>
      )}

      <section className="card">
        <div className="toolbar">
          <TextField
            className="toolbar__search"
            label="Search employees"
            icon="search"
            placeholder="Search by name, email, phone or CNIC"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <SelectField
            className="toolbar__filter"
            label="Availability"
            value={status}
            onChange={changeFilter(setStatus)}
            options={AVAILABILITY_OPTIONS}
            placeholder="All statuses"
          />
          <SelectField
            className="toolbar__filter"
            label="Organization"
            value={organizationId}
            onChange={changeFilter(setOrganizationId)}
            options={organizationOptions}
            placeholder="All organizations"
          />
          <SelectField
            className="toolbar__filter"
            label="Skill"
            value={skillId}
            onChange={changeFilter(setSkillId)}
            options={skillOptions}
            placeholder="All skills"
          />
          <SelectField
            className="toolbar__filter"
            label="Shift"
            value={shiftId}
            onChange={changeFilter(setShiftId)}
            options={shiftOptions}
            placeholder="All shifts"
          />
          <SelectField
            className="toolbar__filter"
            label="Account"
            value={active}
            onChange={changeFilter(setActive)}
            options={ACTIVE_OPTIONS}
            placeholder="All accounts"
          />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading employees..." />
        ) : items.length === 0 ? (
          <EmptyState
            icon="users"
            title="No employees found"
            text={
              debouncedSearch || status || organizationId || skillId || shiftId || active !== 'true'
                ? 'Try changing or clearing the filters.'
                : 'Add your first employee to start building the workforce pool.'
            }
            action={
              !debouncedSearch && !status && !organizationId && !skillId && !shiftId ? (
                <Button onClick={() => navigate('/admin/employees/new')}>
                  <Icon name="plus" size={18} /> Add employee
                </Button>
              ) : null
            }
          />
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
                    <th>Organization</th>
                    <th>Hourly rate</th>
                    <th>Account</th>
                    <th>View</th>
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((employee) => (
                    <tr key={employee.employeeId} className={employee.isActive ? '' : 'is-inactive'}>
                      <td>
                        <div className="person">
                          <Avatar userId={employee.userId} name={employee.fullName} hasPicture={employee.hasPicture} />
                          <span>
                            <span className="person__name">{employee.fullName}</span>
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
                      <td>
                        {employee.workingOrgName || employee.organizationName || <span className="cell-muted">Central pool</span>}
                        {employee.workingOrgName && employee.isWorkingElsewhere && (
                          <span className="person__sub">Home: {employee.organizationName || 'Central pool'}</span>
                        )}
                      </td>
                      <td>{employee.hourlyRate != null ? formatMoney(employee.hourlyRate) : <span className="cell-muted">—</span>}</td>
                      <td>
                        <ActiveBadge isActive={employee.isActive} />
                      </td>
                      <td>
                        <ViewButton to={`/admin/employees/${employee.employeeId}`} label={`View ${employee.fullName}`} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="icon-btn" onClick={() => startEdit(employee)} disabled={loadingEditId === employee.employeeId} aria-label={`Edit ${employee.fullName}`} title="Edit">
                            <Icon name="edit" size={17} />
                          </button>
                          <button
                            type="button"
                            className={`icon-btn ${employee.isActive ? 'icon-btn--danger' : ''}`}
                            onClick={() => setToggleTarget(employee)}
                            aria-label={`${employee.isActive ? 'Deactivate' : 'Activate'} ${employee.fullName}`}
                            title={employee.isActive ? 'Deactivate' : 'Activate'}
                          >
                            <Icon name={employee.isActive ? 'ban' : 'checkCircle'} size={17} />
                          </button>
                          {!employee.isActive && (
                            <DeleteForever
                              name={employee.fullName}
                              title="Delete employee completely?"
                              message={`${employee.fullName} and their sign-in account will be removed for good, with their skills, shift and salary set-up. This cannot be undone. An employee who has allocations, payroll, overtime or reviews cannot be deleted because those records must be kept.`}
                              onDelete={() => employeesApi.remove(employee.employeeId)}
                              onDone={(message) => {
                                setNotice(message)
                                reload()
                              }}
                            />
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

      {formTarget && (
        <EmployeeFormModal
          employee={formTarget === 'new' ? null : formTarget}
          organizations={organizations ?? []}
          onClose={() => setFormTarget(null)}
          onSaved={handleSaved}
          onPictureChanged={() => reload()}
        />
      )}

      {toggleTarget && (
        <ConfirmDialog
          title={toggleTarget.isActive ? 'Deactivate employee?' : 'Activate employee?'}
          message={
            toggleTarget.isActive
              ? `${toggleTarget.fullName} will no longer be able to sign in or be allocated. Their history is kept, and you can activate them again later.`
              : `${toggleTarget.fullName} will be able to sign in again. Their availability stays Offline until you change it.`
          }
          confirmLabel={toggleTarget.isActive ? 'Deactivate' : 'Activate'}
          danger={toggleTarget.isActive}
          onConfirm={handleToggleActive}
          onCancel={() => setToggleTarget(null)}
        />
      )}
    </div>
  )
}

export default EmployeesPage
