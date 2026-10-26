import Badge from '../../../components/ui/Badge.jsx'
import { humanize } from '../../../utils/format.js'

const TONES = {
  Pending: 'warning',
  Active: 'success',
  Approved: 'success',
  Rejected: 'danger',
  Suspended: 'neutral',
  Terminated: 'neutral',
  // allocations
  Completed: 'neutral',
  Reallocated: 'info',
  Cancelled: 'neutral',
  // invoices
  Draft: 'neutral',
  PendingVerification: 'warning',
  Issued: 'info',
  PartiallyPaid: 'warning',
  Overdue: 'danger',
  Paid: 'success',
}

/** Status of an organization, contract or staff request. */
function WorkflowBadge({ status }) {
  if (!status) return <span className="cell-muted">—</span>
  return (
    <Badge tone={TONES[status] || 'neutral'} dot>
      {status === 'PendingVerification' ? 'Waiting for verification' : humanize(status)}
    </Badge>
  )
}

export default WorkflowBadge
