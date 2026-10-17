import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { employeeHoursApi } from '../../../services/employee/employeeService.js'
import '../../admin/finance/FinanceTiles.css'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** yyyy-MM-dd of a Date in the browser's own time zone (the days from the server are plain dates). */
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

/** 8 -> "8 h", 7.5 -> "7.5 h", 0 -> "0 h" */
const hours = (value) => `${Number((value ?? 0).toFixed(2))} h`

function addDays(date, count) {
  const next = new Date(date)
  next.setDate(next.getDate() + count)
  return next
}

/** Monday of the week that contains the date. */
function mondayOf(date) {
  return addDays(date, -((date.getDay() + 6) % 7))
}

/** Hours worked on a day so far: past days in full, today only up to now, future days none. Overtime counts once the day has started. */
function workedOn(day, todayKey, now) {
  if (day.date > todayKey) return 0
  if (day.date < todayKey) return day.scheduledHours + day.overtimeHours
  if (!day.shiftName) return day.overtimeHours
  const start = minutes(day.startTime)
  const elapsed = Math.max(0, Math.min(now.getHours() * 60 + now.getMinutes() - start, day.scheduledHours * 60)) / 60
  return elapsed + day.overtimeHours
}

function totalsOf(days, todayKey, now) {
  return days.reduce(
    (sum, day) => ({
      worked: sum.worked + workedOn(day, todayKey, now),
      planned: sum.planned + day.scheduledHours + day.overtimeHours,
      overtime: sum.overtime + day.overtimeHours,
      pendingOvertime: sum.pendingOvertime + day.pendingOvertimeHours,
      workDays: sum.workDays + (day.scheduledHours > 0 ? 1 : 0),
    }),
    { worked: 0, planned: 0, overtime: 0, pendingOvertime: 0, workDays: 0 },
  )
}

function HoursTile({ label, totals, caption }) {
  return (
    <article className="card finance-tile">
      <p className="finance-tile__label">{label}</p>
      <p className="finance-tile__value">{hours(totals.worked)}</p>
      <p className="finance-tile__caption">
        {caption} · planned {hours(totals.planned)}
        {totals.overtime > 0 && <> · overtime {hours(totals.overtime)}</>}
      </p>
    </article>
  )
}

/** Employee: how many hours I work in a week and in a month, from the shifts the admin assigned plus approved overtime. */
function EmployeeHoursPage() {
  const today = new Date()
  const todayKey = isoDay(today)
  // The month on screen is kept as its first day; the loaded period is padded to whole weeks (Monday to Sunday).
  const [monthStart, setMonthStart] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
  const from = isoDay(mondayOf(monthStart))
  const to = isoDay(addDays(mondayOf(monthEnd), 6))
  const monthKeyFrom = isoDay(monthStart)
  const monthKeyTo = isoDay(monthEnd)

  const { data, error, loading, reload } = useFetch((signal) => employeeHoursApi.days(from, to, signal), `employee-hours-${from}-${to}`)
  const isCurrentMonth = monthStart.getFullYear() === today.getFullYear() && monthStart.getMonth() === today.getMonth()
  const move = (step) => setMonthStart((current) => new Date(current.getFullYear(), current.getMonth() + step, 1))

  const header = (
    <PageHeader
      title="My Hours"
      description="How many hours you work in a week and in a month: the shifts the admin assigned to you, plus approved overtime."
      actions={
        <div className="row-actions">
          <Button variant="secondary" onClick={() => move(-1)} aria-label="Previous month">
            <Icon name="chevronLeft" size={18} />
          </Button>
          <strong style={{ minWidth: '9rem', textAlign: 'center' }}>
            {MONTH_NAMES[monthStart.getMonth()]} {monthStart.getFullYear()}
          </strong>
          <Button variant="secondary" onClick={() => move(1)} aria-label="Next month">
            <Icon name="chevronRight" size={18} />
          </Button>
        </div>
      }
    />
  )

  if (!data && loading) {
    return (
      <div className="page">
        {header}
        <Spinner label="Loading your hours..." />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="page">
        {header}
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      </div>
    )
  }

  const days = data.days ?? []
  const monthDays = days.filter((day) => day.date >= monthKeyFrom && day.date <= monthKeyTo)
  const monthTotals = totalsOf(monthDays, todayKey, today)

  // Whole weeks, Monday to Sunday.
  const weeks = []
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7))
  const currentWeek = weeks.find((week) => week.some((day) => day.date === todayKey))
  const weekTotals = currentWeek ? totalsOf(currentWeek, todayKey, today) : null

  const label = (key) => {
    const [y, m, d] = key.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    return `${DAY_NAMES[date.getDay()]} ${d} ${MONTH_NAMES[m - 1].slice(0, 3)}`
  }

  if (!data.hasEmployeeRecord || (monthTotals.planned === 0 && monthTotals.pendingOvertime === 0 && days.every((day) => !day.shiftName))) {
    return (
      <div className="page">
        {header}
        <section className="card">
          <div className="card__body">
            <EmptyState icon="clock" title="No hours to show" text="No shift is assigned to you in this period. When the admin assigns you a shift, your hours appear here." />
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page">
      {header}

      <Alert type="info">
        There is no clock-in yet, so hours are counted from your assigned shifts (each day your shift covers) plus overtime that was approved. Today counts only up to the current time.
      </Alert>

      <section className="finance-tiles" aria-label="Totals">
        {weekTotals && <HoursTile label="This week" totals={weekTotals} caption={`${weekTotals.workDays} shift days`} />}
        <HoursTile label={`${MONTH_NAMES[monthStart.getMonth()]}${isCurrentMonth ? ' so far' : ''}`} totals={monthTotals} caption={`${monthTotals.workDays} shift days`} />
        {monthTotals.pendingOvertime > 0 && (
          <article className="card finance-tile finance-tile--gold">
            <p className="finance-tile__label">Overtime waiting for approval</p>
            <p className="finance-tile__value">{hours(monthTotals.pendingOvertime)}</p>
            <p className="finance-tile__caption">Not counted until it is approved</p>
          </article>
        )}
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Week by week</h3>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Week</th>
                <th className="num">Shift days</th>
                <th className="num">Hours worked</th>
                <th className="num">Planned</th>
                <th className="num">Overtime</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => {
                const totals = totalsOf(week, todayKey, today)
                const isThisWeek = week.some((day) => day.date === todayKey)
                return (
                  <tr key={week[0].date} style={isThisWeek ? { fontWeight: 700 } : undefined}>
                    <td>
                      {label(week[0].date)} – {label(week[week.length - 1].date)}
                      {isThisWeek && <span className="cell-muted"> · this week</span>}
                    </td>
                    <td className="num">{totals.workDays}</td>
                    <td className="num">{hours(totals.worked)}</td>
                    <td className="num">{hours(totals.planned)}</td>
                    <td className="num">{totals.overtime > 0 ? hours(totals.overtime) : '—'}</td>
                  </tr>
                )
              })}
              <tr>
                <td>
                  <strong>{MONTH_NAMES[monthStart.getMonth()]} total</strong> <span className="cell-muted">(only the days of this month)</span>
                </td>
                <td className="num"><strong>{monthTotals.workDays}</strong></td>
                <td className="num"><strong>{hours(monthTotals.worked)}</strong></td>
                <td className="num"><strong>{hours(monthTotals.planned)}</strong></td>
                <td className="num"><strong>{monthTotals.overtime > 0 ? hours(monthTotals.overtime) : '—'}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Day by day</h3>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Shift</th>
                <th className="num">Shift hours</th>
                <th className="num">Overtime</th>
                <th className="num">Worked</th>
              </tr>
            </thead>
            <tbody>
              {monthDays.map((day) => {
                const future = day.date > todayKey
                return (
                  <tr key={day.date} className={future ? 'is-inactive' : ''} style={day.date === todayKey ? { fontWeight: 700 } : undefined}>
                    <td>
                      {label(day.date)}
                      {day.date === todayKey && <span className="cell-muted"> · today</span>}
                    </td>
                    <td>
                      {day.shiftName ? (
                        <>
                          {day.shiftName} <span className="cell-muted">{clock(day.startTime)} – {clock(day.endTime)}</span>
                        </>
                      ) : (
                        <Badge tone="neutral">Off</Badge>
                      )}
                    </td>
                    <td className="num">{day.shiftName ? hours(day.scheduledHours) : '—'}</td>
                    <td className="num">
                      {day.overtimeHours > 0 ? hours(day.overtimeHours) : '—'}
                      {day.pendingOvertimeHours > 0 && <span className="person__sub">{hours(day.pendingOvertimeHours)} waiting for approval</span>}
                    </td>
                    <td className="num">{future ? '—' : hours(workedOn(day, todayKey, today))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default EmployeeHoursPage
