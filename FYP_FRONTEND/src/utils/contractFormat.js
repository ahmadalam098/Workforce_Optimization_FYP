import { TERM_GROUPS } from '../constants/contracts.js'
import { formatDate, formatMoney } from './format.js'

const FIELD_BY_KEY = Object.fromEntries(TERM_GROUPS.flatMap((group) => group.fields.map((field) => [field.key, field])))

/** "08:00:00" -> "08:00" (for display and <input type="time">). */
export function toTimeInput(value) {
  return value ? String(value).slice(0, 5) : ''
}

/** "08:00" -> "08:00:00" (what the API expects). */
export function toApiTime(value) {
  if (!value) return undefined
  return value.length === 5 ? `${value}:00` : value
}

/** Formats one contract term for display. */
export function formatTerm(key, value) {
  if (value === null || value === undefined || value === '') return '—'
  switch (FIELD_BY_KEY[key]?.type) {
    case 'bool':
      return value ? 'Yes' : 'No'
    case 'minutes':
      return `${value} min`
    case 'money':
      return formatMoney(value)
    case 'date':
      return formatDate(value)
    case 'time':
      return toTimeInput(value)
    default:
      return String(value)
  }
}

export function formatPeriod(startDate, endDate) {
  if (!startDate && !endDate) return '—'
  return `${startDate ? formatDate(startDate) : '…'} – ${endDate ? formatDate(endDate) : 'open'}`
}

/** Shift time range, e.g. "08:00 – 16:00". */
export function formatTimeRange(start, end) {
  if (!start && !end) return '—'
  return `${toTimeInput(start) || '—'} – ${toTimeInput(end) || '—'}`
}

/** 480 -> "8 h", 450 -> "7 h 30 min". */
export function formatDuration(minutes) {
  if (!minutes) return '—'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

export function formatStaffRange(min, max) {
  if (min == null && max == null) return '—'
  return `${min ?? '—'} – ${max ?? '—'}`
}
