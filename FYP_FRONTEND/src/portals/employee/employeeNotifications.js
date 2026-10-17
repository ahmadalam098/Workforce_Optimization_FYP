// What the Employee bell links to, and the one alert it works out itself (today's shift), using the browser's local date and time.

/** The employee page for a notification. The action matters because shifts and salary are both audited on the employee. */
export function employeeEntityLink(entityType, entityId, action = '') {
  if (entityType === 'Ticket' && entityId) return `/employee/queries/${entityId}`
  if (entityType === 'Payroll') return '/employee/salary'
  if (action === 'OFFER_SENT') return '/employee/assignments'
  if (action === 'CALL_CUT_BY_MANAGER') return '/employee/calls'
  if (action.startsWith('SHIFT_')) return '/employee/shifts'
  if (action.startsWith('SALARY_')) return '/employee/salary'
  return '/employee/dashboard'
}

function isoDay(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const minutes = (time) => {
  const [h, m] = String(time ?? '0:0').split(':')
  return Number(h) * 60 + Number(m)
}
const clock = (time) => String(time ?? '').slice(0, 5)

/** "Your shift starts at 09:00" while today's shift has not started yet, otherwise nothing. */
export function todayShiftAlerts(feed, now = new Date()) {
  const today = isoDay(now)
  const shift = (feed.shifts ?? [])
    .filter((entry) => entry.startDate <= today && (!entry.endDate || entry.endDate >= today))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
  if (!shift || minutes(shift.startTime) <= now.getHours() * 60 + now.getMinutes()) return []

  const wait = minutes(shift.startTime) - (now.getHours() * 60 + now.getMinutes())
  const in_ = wait >= 60 ? `in ${Math.floor(wait / 60)} h ${wait % 60} min` : `in ${wait} min`
  return [
    {
      key: `shift-${today}-${shift.startTime}`,
      title: `Your shift starts at ${clock(shift.startTime)}`,
      message: `${shift.name || 'Shift'} today, ${clock(shift.startTime)} - ${clock(shift.endTime)} (${in_}).`,
      link: '/employee/shifts',
    },
  ]
}
