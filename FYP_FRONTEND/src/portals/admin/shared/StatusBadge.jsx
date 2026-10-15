import Badge from '../../../components/ui/Badge.jsx'
import { humanize } from '../../../utils/format.js'

const TONES = {
  Available: 'success',
  Assigned: 'info',
  Busy: 'warning',
  Idle: 'neutral',
  OnBreak: 'warning',
  Offline: 'neutral',
  OnLeave: 'gold',
}

/** Availability status of an employee. */
export function AvailabilityBadge({ status }) {
  if (!status) return <span className="cell-muted">—</span>
  return (
    <Badge tone={TONES[status] || 'neutral'} dot>
      {humanize(status)}
    </Badge>
  )
}

/** Account active/inactive. */
export function ActiveBadge({ isActive }) {
  return <Badge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'Active' : 'Inactive'}</Badge>
}
