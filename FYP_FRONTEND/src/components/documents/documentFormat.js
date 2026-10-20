import { formatDate } from '../../utils/format.js'

/** A date as the system shows dates, or nothing when there is none. */
export const day = (value) => (value ? formatDate(value) : '')
