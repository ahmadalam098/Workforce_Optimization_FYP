import Badge from '../../../components/ui/Badge.jsx'
import { humanize } from '../../../utils/format.js'

const PRIORITY_TONES = { Low: 'neutral', Medium: 'info', High: 'warning', Critical: 'danger' }
const STATUS_TONES = { Open: 'warning', Resolved: 'success' }

export function PriorityBadge({ priority }) {
  return (
    <Badge tone={PRIORITY_TONES[priority] || 'neutral'} dot>
      {priority}
    </Badge>
  )
}

export function TicketStatusBadge({ status }) {
  return <Badge tone={STATUS_TONES[status] || 'neutral'}>{humanize(status)}</Badge>
}

/** Shown on a query or complaint that the organization's manager sent to the admin. */
export function ForwardedBadge({ ticket }) {
  if (!ticket.forwardedAt) return null
  return (
    <Badge tone="gold" dot>
      Sent by {ticket.forwardedBy || 'the manager'}
    </Badge>
  )
}

/** Where a query comes from: an employee, or an organization (also when its manager logged it for the organization). */
export function SourceBadge({ ticket }) {
  return ticket.source === 'Employee' ? <Badge tone="info">Employee</Badge> : <Badge tone="neutral">Organization</Badge>
}

/** Query, Complaint ... */
export function CategoryBadge({ category }) {
  return <Badge tone={category === 'Complaint' ? 'danger' : 'info'}>{category}</Badge>
}
