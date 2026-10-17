import { useState } from 'react'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { organizationRequestsApi } from '../../../services/organization/organizationService.js'
import { formatDate, formatTimeAgo } from '../../../utils/format.js'
import { PriorityBadge } from '../../admin/queries/TicketBadges.jsx'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import ViewButton from '../../admin/shared/ViewButton.jsx'
import WorkflowBadge from '../../admin/shared/WorkflowBadge.jsx'
import OrganizationRequestModal from './OrganizationRequestModal.jsx'

const STATUS_OPTIONS = [
  { value: 'Pending', label: 'Waiting for the manager' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Unstaffed', label: 'Approved, employees still coming' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'Cancelled', label: 'Cancelled' },
]

/** Organization: the requests for extra employees. They go to the organization manager, who approves them and chooses the employees. */
function OrganizationRequestsPage() {
  const [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useFlashNotice()
  const { data, error, loading, reload } = useFetch((signal) => organizationRequestsApi.list(status, signal), `organization-requests-${status}`)
  const items = data ?? []

  return (
    <div className="page">
      <PageHeader
        title="Staff Requests"
        description="Your contract's minimum employees are appointed by your manager. Ask here for more on top of them; your manager approves the request and chooses the employees."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Icon name="plus" size={18} /> Ask for extra employees
          </Button>
        }
      />
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card">
        <div className="toolbar">
          <SelectField className="toolbar__filter" label="Status" value={status} onChange={(event) => setStatus(event.target.value)} options={STATUS_OPTIONS} placeholder="All statuses" />
        </div>
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading your requests..." />
        ) : items.length === 0 ? (
          <EmptyState icon="inbox" title="No requests" text={status ? 'Nothing with this status.' : 'You have not asked for extra employees yet.'} />
        ) : (
          <div className="table-wrap" aria-busy={loading}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th className="num">Employees</th>
                  <th>Skill</th>
                  <th>Priority</th>
                  <th>Needed</th>
                  <th>Status</th>
                  <th>Asked</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>
                {items.map((request) => (
                  <tr key={request.requestId}>
                    <td>
                      <strong>#{request.requestId}</strong>
                      <span className="person__sub">{request.reason}</span>
                    </td>
                    <td className="num">
                      {request.staffedNow} / {request.requiredEmployees}
                    </td>
                    <td>{request.skillName || <span className="cell-muted">Any</span>}</td>
                    <td>
                      <PriorityBadge priority={request.priority} />
                    </td>
                    <td className="cell-muted">
                      {formatDate(request.startDatetime)} – {formatDate(request.endDatetime)}
                    </td>
                    <td>
                      <WorkflowBadge status={request.status} />
                    </td>
                    <td className="cell-muted">{formatTimeAgo(request.createdAt)}</td>
                    <td>
                      <ViewButton to={`/organization/requests/${request.requestId}`} label={`View request ${request.requestId}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating && (
        <OrganizationRequestModal
          onClose={() => setCreating(false)}
          onDone={(message) => {
            setCreating(false)
            setNotice(message)
            reload()
          }}
        />
      )}
    </div>
  )
}

export default OrganizationRequestsPage
