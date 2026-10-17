import { useState } from 'react'
import Badge from '../../../components/ui/Badge.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { employeeShiftsApi } from '../../../services/employee/employeeService.js'
import { formatDate } from '../../../utils/format.js'
import '../../admin/finance/FinanceTiles.css'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'

const FILTERS = [
  { value: 'current', label: 'Current' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** yyyy-MM-dd of a Date in the browser's own time zone (assignment dates are plain dates). */
function isoDay(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const clock = (time) => String(time ?? '').slice(0, 5)
const minutes = (time) => {
  const [h, m] = String(time ?? '0:0').split(':')
  return Number(h) * 60 + Number(m)
}
const covers = (shift, day) => shift.startDate <= day && (!shift.endDate || shift.endDate >= day)

/** Which assignment applies on a day (the latest one that started, when two overlap). */
function shiftOn(shifts, day) {
  return shifts.filter((shift) => covers(shift, day)).sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null
}

/** Where the shift is right now, for today's card. */
function statusOf(shift, now) {
  const start = minutes(shift.startTime)
  const end = minutes(shift.endTime)
  const current = now.getHours() * 60 + now.getMinutes()
  const overnight = end <= start
  const running = overnight ? current >= start || current < end : current >= start && current < end
  if (running) return { label: `Running now, until ${clock(shift.endTime)}`, tone: 'success' }
  if (current < start) return { label: `Starts at ${clock(shift.startTime)}`, tone: 'warning' }
  return { label: 'Finished for today', tone: 'neutral' }
}

function rangeText(shift) {
  return `${formatDate(shift.startDate)} – ${shift.endDate ? formatDate(shift.endDate) : 'ongoing'}`
}

function weekDays(today) {
  // Monday to Sunday of the current week.
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return date
  })
}

/** Employee: the shifts the admin assigned to me - today, this week and my history. */
function EmployeeShiftsPage() {
  const [filter, setFilter] = useState('current')
  const { data, error, loading, reload } = useFetch((signal) => employeeShiftsApi.mine(signal), 'employee-shifts')

  if (!data && loading) return <Spinner label="Loading your shifts..." />
  if (!data) {
    return (
      <div className="card">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  const shifts = data.shifts ?? []
  const now = new Date()
  const todayKey = isoDay(now)
  const todayShift = shiftOn(shifts, todayKey)
  const status = todayShift ? statusOf(todayShift, now) : null
  // The assignment to show in detail: the one for today, otherwise the next one that starts.
  const upcomingFirst = shifts.filter((shift) => shift.startDate > todayKey).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  const detail = todayShift ?? upcomingFirst

  const filtered = shifts.filter((shift) => {
    if (filter === 'upcoming') return shift.startDate > todayKey
    if (filter === 'past') return shift.endDate && shift.endDate < todayKey
    return covers(shift, todayKey)
  })

  return (
    <div className="page">
      <PageHeader title="My Shifts" description="The shifts the admin assigned to you. Ask the admin if something looks wrong." />

      {!data.hasEmployeeRecord || shifts.length === 0 ? (
        <section className="card">
          <div className="card__body">
            <EmptyState icon="clock" title="No shift assigned yet" text="When the admin assigns you a shift, it will appear here." />
          </div>
        </section>
      ) : (
        <>
          <section className="finance-tiles" aria-label="Today">
            <article className="card finance-tile">
              <p className="finance-tile__label">Today</p>
              <p className="finance-tile__value">{todayShift ? todayShift.shiftName : 'No shift'}</p>
              <p className="finance-tile__caption">{todayShift ? `${clock(todayShift.startTime)} – ${clock(todayShift.endTime)}` : 'You have no shift today.'}</p>
            </article>
            <article className="card finance-tile">
              <p className="finance-tile__label">Status</p>
              <p className="finance-tile__value" style={{ fontSize: '1.15rem' }}>
                {status ? <Badge tone={status.tone}>{status.label}</Badge> : <span className="cell-muted">—</span>}
              </p>
            </article>
            <article className="card finance-tile">
              <p className="finance-tile__label">Working for</p>
              <p className="finance-tile__value" style={{ fontSize: '1.15rem' }}>{data.workingOrganization || '—'}</p>
              <p className="finance-tile__caption">{data.workingOrganization ? 'Your organization right now' : 'Not assigned to an organization'}</p>
            </article>
          </section>

          <div className="details-grid">
            <section className="card">
              <div className="card__header">
                <h3 className="card__title">{todayShift ? 'My current shift' : 'My next shift'}</h3>
              </div>
              {detail ? (
                <dl className="card__body info-list">
                  <div className="info-item"><dt>Shift</dt><dd>{detail.shiftName} ({clock(detail.startTime)} – {clock(detail.endTime)})</dd></div>
                  <div className="info-item"><dt>From</dt><dd>{formatDate(detail.startDate)}</dd></div>
                  <div className="info-item"><dt>Until</dt><dd>{detail.endDate ? formatDate(detail.endDate) : 'Ongoing'}</dd></div>
                  <div className="info-item"><dt>Assigned by</dt><dd>{detail.assignedBy || <span className="cell-muted">—</span>}</dd></div>
                  <div className="info-item"><dt>Note from the admin</dt><dd>{detail.notes || <span className="cell-muted">No note</span>}</dd></div>
                </dl>
              ) : (
                <div className="card__body">
                  <EmptyState icon="clock" title="No current or upcoming shift" text="Your earlier shifts are listed below under Past." />
                </div>
              )}
            </section>

            <section className="card">
              <div className="card__header">
                <h3 className="card__title">This week</h3>
              </div>
              <ul className="card__body plain-list">
                {weekDays(now).map((date) => {
                  const key = isoDay(date)
                  const shift = shiftOn(shifts, key)
                  return (
                    <li key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontWeight: key === todayKey ? 700 : 400 }}>
                      <span>
                        {DAY_NAMES[date.getDay()]} {date.getDate()}
                        {key === todayKey && <span className="cell-muted"> · today</span>}
                      </span>
                      {shift ? (
                        <span>
                          {shift.shiftName} <span className="cell-muted">{clock(shift.startTime)} – {clock(shift.endTime)}</span>
                        </span>
                      ) : (
                        <Badge tone="neutral">Off</Badge>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          </div>

          <section className="card">
            <div className="card__header">
              <h3 className="card__title">Shift history</h3>
            </div>
            <div className="toolbar">
              <SelectField className="toolbar__filter" label="Show" value={filter} onChange={(event) => setFilter(event.target.value)} options={FILTERS} />
            </div>
            {filtered.length === 0 ? (
              <EmptyState icon="clock" title="Nothing here" text="No shift matches this filter." />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Shift</th>
                      <th>Time</th>
                      <th>Dates</th>
                      <th>Assigned by</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((shift) => (
                      <tr key={shift.assignmentId}>
                        <td><strong>{shift.shiftName}</strong></td>
                        <td>{clock(shift.startTime)} – {clock(shift.endTime)}</td>
                        <td className="cell-muted">{rangeText(shift)}</td>
                        <td>{shift.assignedBy || <span className="cell-muted">—</span>}</td>
                        <td className="cell-muted">{shift.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

export default EmployeeShiftsPage
