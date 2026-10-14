// The API returns UTC date-times without a timezone suffix; treat them as UTC.
function toDate(value) {
  if (!value) return null
  const text = String(value)
  const hasZone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(text)
  const date = new Date(text.includes('T') && !hasZone ? `${text}Z` : text)
  return Number.isNaN(date.getTime()) ? null : date
}

// How dates are shown is chosen in Settings > General; the admin layout loads the choice and calls setDisplayPrefs.
const prefs = { timezone: 'auto', dateFormat: 'dmy-short', timeFormat: '12h', language: 'en-GB' }

export function setDisplayPrefs(next) {
  Object.assign(prefs, next)
}

function zoneOf(forceUtc) {
  if (forceUtc) return 'UTC'
  return prefs.timezone === 'auto' ? undefined : prefs.timezone
}

function dateText(date, timeZone) {
  try {
    const part = (options) => new Intl.DateTimeFormat(prefs.language, { timeZone, ...options }).format(date)
    const day = part({ day: '2-digit' })
    const month = part({ month: '2-digit' })
    const year = part({ year: 'numeric' })
    if (prefs.dateFormat === 'dmy') return `${day}/${month}/${year}`
    if (prefs.dateFormat === 'mdy') return `${month}/${day}/${year}`
    if (prefs.dateFormat === 'iso') return `${year}-${month}-${day}`
    return `${Number(day)} ${part({ month: 'short' })} ${year}`
  } catch {
    return date.toLocaleDateString()
  }
}

function timeText(date, timeZone) {
  try {
    return new Intl.DateTimeFormat(prefs.language, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      ...(prefs.timeFormat === '24h' ? { hourCycle: 'h23' } : { hour12: true }),
    }).format(date)
  } catch {
    return date.toLocaleTimeString()
  }
}

export function formatDate(value) {
  if (!value) return '—'
  // Date-only values (yyyy-mm-dd) are calendar days: they must not move with the timezone.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
  const date = dateOnly ? new Date(`${value}T00:00:00Z`) : toDate(value)
  if (!date) return '—'
  return dateText(date, zoneOf(dateOnly))
}

export function formatDateTime(value) {
  const date = toDate(value)
  if (!date) return '—'
  return `${dateText(date, zoneOf(false))}, ${timeText(date, zoneOf(false))}`
}

export function formatTimeAgo(value) {
  const date = toDate(value)
  if (!date) return ''
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days < 30 ? `${days} d ago` : formatDate(value)
}

export function formatNumber(value) {
  return value === null || value === undefined ? '—' : Number(value).toLocaleString()
}

export function formatMoney(value) {
  return value === null || value === undefined ? '—' : Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 60000, 'PKR' -> "PKR 60,000.00". Every amount is shown with its currency. */
export function formatCurrency(amount, currency = 'PKR') {
  if (amount === null || amount === undefined) return '—'
  try {
    // Always two decimals: the browser shows none for PKR by default, which would hide paisa.
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${formatMoney(amount)} ${currency}`
  }
}

/** Same as formatCurrency but without decimals, for big summary numbers. */
export function formatCurrencyWhole(amount, currency = 'PKR') {
  if (amount === null || amount === undefined) return '—'
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${Math.round(amount).toLocaleString()} ${currency}`
  }
}

export function formatMonth(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

// "OnBreak" -> "On Break"
export function humanize(value) {
  return value ? String(value).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ') : '—'
}

export function getInitials(name = '') {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || '?'
  )
}

/** API date-time (UTC) -> value for a datetime-local input, in the browser's local time. */
export function toLocalInputValue(value) {
  const date = toDate(value)
  if (!date) return ''
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
