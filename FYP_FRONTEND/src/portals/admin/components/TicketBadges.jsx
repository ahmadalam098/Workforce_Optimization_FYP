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
