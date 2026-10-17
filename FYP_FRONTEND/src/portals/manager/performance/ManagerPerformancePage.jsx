import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Avatar from '../../../components/ui/Avatar.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useCalls } from '../../../components/calls/callContext.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { managerAllocationsApi, managerApi } from '../../../services/manager/managerService.js'
import { formatDateTime, formatTimeAgo } from '../../../utils/format.js'
import '../../admin/finance/FinanceTiles.css'
import DecisionModal from '../../admin/shared/DecisionModal.jsx'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import { AvailabilityBadge } from '../../admin/shared/StatusBadge.jsx'
import { SCORECARD_SLOTS, SESSION_TYPE_OPTIONS, SESSION_TYPES } from './performanceSlots.js'
import SessionViewer from './SessionViewer.jsx'
import { useMonitoredSessions } from './useMonitoredSessions.js'
import './ManagerPerformancePage.css'

const average = (sessions) => {
  const answered = sessions.filter((session) => session.durationSeconds > 0)
  if (answered.length === 0) return '—'
  const total = Math.round(answered.reduce((sum, session) => sum + session.durationSeconds, 0) / answered.length)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Organization Manager: monitor the audio and video calls of your employees and organizations - live, with the button to cut a call - and see how
 * each one went. The recordings, transcripts and quality scores are not there yet (no sound or picture in the calls); the numbers that exist
 * (how many calls, the average length) are real. The employees and organizations in the filters and in the table are real.
 */
function ManagerPerformancePage() {
  const [employeeId, setEmployeeId] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [type, setType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selected, setSelected] = useState(null)
  const [cutting, setCutting] = useState(null)
  const [notice, setNotice] = useFlashNotice()
  const { cut } = useCalls()

  const { data: overview } = useFetch((signal) => managerApi.overview(signal), 'manager-overview')
  // The employees who work for this manager's organizations right now.
  const { data: team, error, loading, reload } = useFetch((signal) => managerAllocationsApi.pool({ view: 'mine', pageSize: 50 }, signal), 'manager-performance-team')

  const organizations = overview?.organizations ?? []
  const employees = team?.items ?? []
  const employeeUserId = employees.find((employee) => String(employee.employeeId) === employeeId)?.userId ?? (employeeId ? 'none' : '')
  const filters = { employeeUserId, organizationId, type, from, to }
  const { sessions } = useMonitoredSessions(filters)
  const live = sessions.filter((session) => session.live)
  const perEmployee = (userId) => sessions.filter((session) => session.employeeId === userId)

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

      <Notice message={notice} onClose={() => setNotice('')} />
      <Alert type="info">
        Calls of your employees and organizations appear here while they happen, and you can cut a call that should not go on. Recordings, transcripts and quality scores are not available yet: the
        calls have no sound or picture for now.
      </Alert>

      <section className="finance-tiles" aria-label="Performance overview">
        {SCORECARD_SLOTS.map((slot) => {
          const value = slot.key === 'sessions' ? sessions.length : slot.key === 'handling' ? average(sessions) : '—'
          const caption = slot.key === 'sessions' ? `${live.length} live now` : slot.caption
          return (
            <article className={`card finance-tile ${slot.key === 'sessions' && live.length > 0 ? 'finance-tile--gold' : ''}`} key={slot.key}>
              <p className="finance-tile__label">{slot.label}</p>
              <p className="finance-tile__value">{value}</p>
              <p className="finance-tile__caption">{caption}</p>
            </article>
          )
        })}
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
              <EmptyState icon="activity" title="No sessions yet" text={anyFilter ? 'No call matches the filters.' : 'Audio and video calls of your employees and organizations will be listed here while they happen.'} />
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
                    <Icon name={session.type === 'video' ? 'video' : 'phone'} size={15} /> {session.employeeName} · {session.organizationName}{' '}
                    {session.live ? <Badge tone="danger">LIVE</Badge> : <span className="cell-muted">{formatTimeAgo(session.startedAt)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <SessionViewer session={sessions.find((session) => session.sessionId === selected) ?? null} onCut={setCutting} />
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
                      <td className="num">{perEmployee(employee.userId).length}</td>
                      <td className="num cell-muted">—</td>
                      <td className="cell-muted" title={perEmployee(employee.userId)[0] ? formatDateTime(perEmployee(employee.userId)[0].startedAt) : undefined}>
                        {perEmployee(employee.userId)[0] ? formatTimeAgo(perEmployee(employee.userId)[0].startedAt) : 'No calls yet'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {cutting && (
        <DecisionModal
          title="Cut this call?"
          description={`The call between ${cutting.caller} and ${cutting.callee} ends at once. Both are told your reason, and it is recorded.`}
          label="Reason"
          required
          danger
          confirmLabel="Cut the call"
          onSubmit={async (reason) => {
            const error = await cut(cutting.sessionId, reason)
            if (error) throw new Error(error)
            setCutting(null)
            setNotice('The call was cut.')
          }}
          onClose={() => setCutting(null)}
        />
      )}
    </div>
  )
}

export default ManagerPerformancePage
