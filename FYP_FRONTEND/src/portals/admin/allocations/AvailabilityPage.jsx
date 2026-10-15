import Avatar from '../../../components/ui/Avatar.jsx'
import { useEffect, useState } from 'react'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Checkbox from '../../../components/ui/Checkbox.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { AVAILABILITY_OPTIONS } from '../../../constants/employee.js'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { availabilityApi, organizationsApi, shiftsApi, skillsApi } from '../../../services/admin/adminService.js'
import { formatDateTime, formatTimeAgo, humanize } from '../../../utils/format.js'
import Notice from '../shared/Notice.jsx'
import PageHeader from '../shared/PageHeader.jsx'
import StatusChangeModal from '../shared/StatusChangeModal.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'
import { AvailabilityBadge } from '../shared/StatusBadge.jsx'
import './AvailabilityPage.css'
import ViewButton from '../shared/ViewButton.jsx'

const PAGE_SIZE = 15
const REFRESH_MS = 30000

const STATUS_COLORS = {
  Available: '#2f9e6b',
  Assigned: '#3b6fc4',
  Busy: '#e0a020',
  Idle: '#a79f90',
  OnBreak: '#d98b3a',
  Offline: '#6b6558',
  OnLeave: '#8a5fb8',
}

/** Live view of who is available, busy or on leave. Refreshes by itself. */
function AvailabilityPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [shiftId, setShiftId] = useState('')
  const [skillId, setSkillId] = useState('')
  const [page, setPage] = useState(1)
  const [live, setLive] = useState(true)
  const [statusTarget, setStatusTarget] = useState(null)
  const [notice, setNotice] = useState('')

  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), status, organizationId, shiftId, skillId, page, pageSize: PAGE_SIZE }
  const { data, error, loading, reload } = useFetch((signal) => availabilityApi.get(params, signal), JSON.stringify(params))
  const { data: organizations } = useFetch((signal) => organizationsApi.lookup(signal), 'organizations')
  const { data: shifts } = useFetch((signal) => shiftsApi.list(signal), 'shifts')
  const { data: skills } = useFetch((signal) => skillsApi.lookup(signal), 'skill-lookup')

  // Poll the API while "Live" is on and the tab is open.
  useEffect(() => {
    if (!live) return undefined
    const timer = setInterval(() => {
      if (!document.hidden) reload()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [live, reload])

  const organizationOptions = (organizations ?? []).map((org) => ({ value: String(org.organizationId), label: org.name }))
  const shiftOptions = (shifts ?? []).map((shift) => ({ value: String(shift.shiftId), label: shift.name }))
  const skillOptions = (skills ?? []).map((skill) => ({ value: String(skill.skillId), label: skill.name }))

  function changeFilter(setter) {
    return (event) => {
      setter(event.target.value)
      setPage(1)
    }
  }

  function pickStatus(value) {
    setStatus((current) => (current === value ? '' : value))
    setPage(1)
  }

  const items = data?.items ?? []
  const summary = data?.summary

  return (
    <div className="page">
      <PageHeader
        title="Availability"
        description="Who can take work right now. Click a status to filter."
        actions={
          <div className="live-controls">
            <Checkbox label="Live (every 30 s)" checked={live} onChange={setLive} />
            <Button variant="secondary" onClick={reload} loading={loading && Boolean(data)}>
              <Icon name="refresh" size={17} /> Refresh
            </Button>
          </div>
        }
      />

      <Notice message={notice} onClose={() => setNotice('')} />

      {summary && (
        <section className="availability-tiles" aria-label="Availability summary">
          <button type="button" className={`availability-tile ${status === '' ? 'is-active' : ''}`} onClick={() => pickStatus('')}>
            <span className="availability-tile__value">{summary.total}</span>
            <span className="availability-tile__label">Active employees</span>
          </button>
          {summary.byStatus.map((item) => (
            <button
              key={item.status}
              type="button"
              className={`availability-tile ${status === item.status ? 'is-active' : ''}`}
              onClick={() => pickStatus(item.status)}
              aria-pressed={status === item.status}
            >
              <span className="availability-tile__value">{item.count}</span>
              <span className="availability-tile__label">
                <span className="availability-tile__dot" style={{ background: STATUS_COLORS[item.status] || '#a79f90' }} aria-hidden="true" />
                {humanize(item.status)}
              </span>
            </button>
          ))}
          <div className="availability-tile availability-tile--static">
            <span className="availability-tile__value">{summary.borrowed}</span>
            <span className="availability-tile__label">Shared with others</span>
          </div>
        </section>
      )}

      <section className="card">
        <div className="toolbar">
          <TextField
            className="toolbar__search"
            label="Search employee"
            icon="search"
            placeholder="Search by name or email"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <SelectField className="toolbar__filter" label="Status" value={status} onChange={changeFilter(setStatus)} options={AVAILABILITY_OPTIONS} placeholder="All statuses" />
          <SelectField className="toolbar__filter" label="Home organization" value={organizationId} onChange={changeFilter(setOrganizationId)} options={organizationOptions} placeholder="All organizations" />
          <SelectField className="toolbar__filter" label="Shift" value={shiftId} onChange={changeFilter(setShiftId)} options={shiftOptions} placeholder="All shifts" />
          <SelectField className="toolbar__filter" label="Skill" value={skillId} onChange={changeFilter(setSkillId)} options={skillOptions} placeholder="All skills" />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading availability..." />
        ) : items.length === 0 ? (
          <EmptyState icon="signal" title="No employees match" text="Try clearing the filters." />
        ) : (
          <>
            {error && <ErrorState error={error} onRetry={reload} />}
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Status</th>
                    <th>Working at</th>
                    <th>Shift</th>
                    <th>Home organization</th>
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
                      <td>
                        <AvailabilityBadge status={employee.availabilityStatus} />
                        {employee.statusSince && (
                          <span className="person__sub" title={formatDateTime(employee.statusSince)}>
                            since {formatTimeAgo(employee.statusSince)}
                          </span>
                        )}
                      </td>
                      <td>
                        {employee.workingOrgName ? (
                          <>
                            <strong>{employee.workingOrgName}</strong>{' '}
                            {employee.isBorrowed && <Badge tone="info">Shared</Badge>}
                          </>
                        ) : (
                          <span className="cell-muted">Not allocated</span>
                        )}
                      </td>
                      <td>{employee.shiftName || <span className="cell-muted">—</span>}</td>
                      <td className="cell-muted">{employee.homeOrgName || 'Central pool'}</td>
                      <td>
                        <ViewButton to={`/admin/employees/${employee.employeeId}`} label={`View ${employee.fullName}`} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="icon-btn" onClick={() => setStatusTarget(employee)} aria-label={`Change status of ${employee.fullName}`} title="Change status">
                            <Icon name="edit" size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
            <p className="availability-updated">Updated {data.refreshedAt ? formatDateTime(data.refreshedAt) : ''}</p>
          </>
        )}
      </section>

      {statusTarget && (
        <StatusChangeModal
          employee={statusTarget}
          onClose={() => setStatusTarget(null)}
          onSaved={(message) => {
            setStatusTarget(null)
            setNotice(message)
            reload()
          }}
        />
      )}
    </div>
  )
}

export default AvailabilityPage
