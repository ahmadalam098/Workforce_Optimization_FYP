import Badge from '../ui/Badge.jsx'
import { formatDateTime } from '../../utils/format.js'
import { EmptyState } from '../../portals/admin/shared/StateBox.jsx'

const TONES = { Ended: 'success', Active: 'info', Ringing: 'info', Missed: 'danger', Declined: 'neutral', Cancelled: 'neutral', Cut: 'danger' }
const LABELS = { Cut: 'Cut by manager' }

function seconds(call) {
  if (!call.answeredAt || !call.endedAt) return null
  const total = Math.max(0, Math.round((new Date(call.endedAt) - new Date(call.answeredAt)) / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** A table of calls. `meKey` (my party key) turns "caller → callee" into "Outgoing / Incoming"; without it both names are shown (the manager's monitor). */
function CallHistory({ calls, meKey }) {
  if (calls.length === 0) return <EmptyState icon="phone" title="No calls yet" text="Your calls will be listed here." />
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{meKey ? 'With' : 'Between'}</th>
            <th>Type</th>
            <th>When</th>
            <th>Length</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call) => {
            const outgoing = meKey && call.caller.key === meKey
            return (
              <tr key={call.callId}>
                <td>
                  {meKey ? (
                    <>
                      <strong>{outgoing ? call.callee.name : call.caller.name}</strong>
                      <span className="person__sub">{outgoing ? 'Outgoing' : 'Incoming'}</span>
                    </>
                  ) : (
                    <>
                      <strong>{call.caller.name}</strong>
                      <span className="person__sub">with {call.callee.name}</span>
                    </>
                  )}
                </td>
                <td>{call.media === 'video' ? 'Video' : 'Voice'}</td>
                <td className="cell-muted">{formatDateTime(call.createdAt)}</td>
                <td>{seconds(call) ?? <span className="cell-muted">—</span>}</td>
                <td>
                  <Badge tone={TONES[call.status] ?? 'neutral'}>{LABELS[call.status] ?? call.status}</Badge>
                  {call.status === 'Cut' && call.endReason && <span className="person__sub">{call.endReason}</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default CallHistory
