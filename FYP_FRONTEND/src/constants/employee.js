import { humanize } from '../utils/format.js'

// Must match AdminControllerBase.AvailabilityStatuses in the backend.
export const AVAILABILITY_STATUSES = [
  'Available',
  'Assigned',
  'Busy',
  'Idle',
  'OnBreak',
  'Offline',
  'OnLeave',
]

export const AVAILABILITY_OPTIONS = AVAILABILITY_STATUSES.map((value) => ({ value, label: humanize(value) }))

export const PROFICIENCY_OPTIONS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'].map((value) => ({ value, label: value }))
