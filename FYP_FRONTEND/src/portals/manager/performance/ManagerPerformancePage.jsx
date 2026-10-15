import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Avatar from '../../../components/ui/Avatar.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { managerAllocationsApi, managerApi } from '../../../services/manager/managerService.js'
import '../../admin/finance/FinanceTiles.css'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import { AvailabilityBadge } from '../../admin/shared/StatusBadge.jsx'
import { SCORECARD_SLOTS, SESSION_TYPE_OPTIONS, SESSION_TYPES } from './performanceSlots.js'
import SessionViewer from './SessionViewer.jsx'
import { useMonitoredSessions } from './useMonitoredSessions.js'
import './ManagerPerformancePage.css'

/**
 * Organization Manager: monitor how the employees perform in their audio calls, video calls and chats with the organizations.
 * UI only for now: the communication does not exist yet, so the sessions are empty and the numbers show "—".
 * The employees and organizations in the filters and in the table are real.
 */
function ManagerPerformancePage() {
  const [employeeId, setEmployeeId] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [type, setType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selected, setSelected] = useState(null)

  const { data: overview } = useFetch((signal) => managerApi.overview(signal), 'manager-overview')
  // The employees who work for this manager's organizations right now.
  const { data: team, error, loading, reload } = useFetch((signal) => managerAllocationsApi.pool({ view: 'mine', pageSize: 50 }, signal), 'manager-performance-team')

  const organizations = overview?.organizations ?? []
  const employees = team?.items ?? []
  const filters = { employeeId, organizationId, type, from, to }
  const { sessions } = useMonitoredSessions(filters)

  const employeeOptions = employees.map((employee) => ({ value: String(employee.employeeId), label: employee.fullName }))
  const organizationOptions = organizations.map((org) => ({ value: String(org.organizationId), label: org.name }))
  const anyFilter = Boolean(employeeId || organizationId || type || from || to)

  function clearFilters() {
    setEmployeeId('')
    setOrganizationId('')
    setType('')
    setFrom('')
    setTo('')
  }

  return (
    <div className="page">
      <PageHeader title="Performance Monitoring" description="Watch how your employees perform in their audio calls, video calls and chats with the organizations." />

      <Alert type="info">
        Monitoring is not switched on yet. Nothing is recorded until employees and organizations start to communicate. This page is ready: the sessions, the player and the scores will appear here
        by themselves.
      </Alert>

      <section className="finance-tiles" aria-label="Performance overview">
        {SCORECARD_SLOTS.map((slot) => (
          <article className="card finance-tile" key={slot.key}>
            <p className="finance-tile__label">{slot.label}</p>
            <p className="finance-tile__value">—</p>
            <p className="finance-tile__caption">{slot.caption}</p>
          </article>
        ))}
      </section>

      <section className="card">
        <div className="toolbar">
          <SelectField className="toolbar__filter" label="Employee" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} options={employeeOptions} placeholder="All employees" />
          {organizations.length > 1 && (
            <SelectField className="toolbar__filter" label="Organization" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} options={organizationOptions} placeholder="All organizations" />
          )}
          <SelectField className="toolbar__filter" label="Type" value={type} onChange={(event) => setType(event.target.value)} options={SESSION_TYPE_OPTIONS} placeholder="All types" />
          <TextField className="toolbar__filter" label="From" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <TextField className="toolbar__filter" label="To" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          {anyFilter && (
            <div className="perf-clear">
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </section>

      <div className="perf-columns">
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Monitored sessions</h3>
          </div>
          {sessions.length === 0 ? (
            <div className="card__body">
              <EmptyState icon="activity" title="No sessions yet" text="Audio calls, video calls and chats between your employees and the organizations will be listed here." />
              <ul className="perf-types" aria-label="What will be monitored">
                {SESSION_TYPES.map((item) => (
                  <li key={item.value}>
                    <span className="perf-types__icon" aria-hidden="true">
                      <Icon name={item.icon} size={18} />
                    </span>
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ul className="perf-sessions">
              {sessions.map((session) => (
                <li key={session.sessionId}>
                  <button type="button" className={selected === session.sessionId ? 'is-active' : ''} onClick={() => setSelected(session.sessionId)}>
                    {session.employeeName} · {session.organizationName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <SessionViewer session={sessions.find((session) => session.sessionId === selected) ?? null} />
      </div>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Employee performance</h3>
        </div>
        {error && !team ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !team && loading ? (
          <Spinner label="Loading your employees..." />
        ) : employees.length === 0 ? (
          <div className="card__body">
            <EmptyState icon="users" title="No employees yet" text="Employees you assign to your organizations in the Employee Pool will be listed here." />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Working at</th>
                  <th>Status</th>
                  <th className="num">Sessions</th>
                  <th className="num">Quality score</th>
                  <th>Last monitored</th>
                </tr>
              </thead>
              <tbody>
                {employees
                  .filter((employee) => !employeeId || String(employee.employeeId) === employeeId)
                  .filter((employee) => !organizationId || String(employee.workingOrgId) === organizationId)
                  .map((employee) => (
                    <tr key={employee.employeeId}>
                      <td>
                        <div className="person">
                          <Avatar userId={employee.userId} name={employee.fullName} hasPicture={employee.hasPicture} />
                          <span>
                            <span className="person__name">{employee.fullName}</span>
                            <span className="person__sub">EMP-{String(employee.employeeId).padStart(3, '0')}</span>
                          </span>
                        </div>
                      </td>
                      <td>{employee.workingOrgName}</td>
                      <td>
                        <AvailabilityBadge status={employee.availabilityStatus} />
                      </td>
                      <td className="num">0</td>
                      <td className="num cell-muted">—</td>
                      <td className="cell-muted">Not monitored yet</td>
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

export default ManagerPerformancePage
