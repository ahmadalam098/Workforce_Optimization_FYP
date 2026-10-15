import Badge from '../../../components/ui/Badge.jsx'

const TONES = { Paid: 'success', Approved: 'info', Draft: 'warning', NotProcessed: 'neutral' }

/** Paid / Approved, waiting to be paid / Being prepared / Not processed yet. */
export function SalaryStatusBadge({ status, label }) {
  return (
    <Badge tone={TONES[status] || 'neutral'} dot>
      {label || status}
    </Badge>
  )
}
