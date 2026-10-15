import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { REQUEST_STATUS_OPTIONS } from '../../../constants/requests.js'
import { TICKET_PRIORITY_OPTIONS } from '../../../constants/support.js'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { organizationsApi, workforceRequestsApi } from '../../../services/admin/adminService.js'
import { formatDate, formatTimeAgo } from '../../../utils/format.js'
import PageHeader from '../shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'
import { PriorityBadge } from '../queries/TicketBadges.jsx'
import WorkflowBadge from '../shared/WorkflowBadge.jsx'
import '../finance/FinanceTiles.css'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import Notice from '../shared/Notice.jsx'
import ViewButton from '../shared/ViewButton.jsx'

const PAGE_SIZE = 10

/** Requests for employees from organizations: decide, then staff them. */
function StaffRequestsPage() {
  const navigate = useNavigate()
  const [notice, setNotice] = useFlashNotice()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('Pending')
  const [priority, setPriority] = useState('')
  const [orgId, setOrgId] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), status, priority, orgId, page, pageSize: PAGE_SIZE }
  const { data, error, loading, reload } = useFetch((signal) => workforceRequestsApi.list(params, signal), JSON.stringify(params))
  const { data: summary } = useFetch((signal) => workforceRequestsApi.summary(signal), 'request-summary')
  const { data: organizations } = useFetch((signal) => organizationsApi.lookup(signal), 'organizations')

  const organizationOptions = (organizations ?? []).map((org) => ({ value: String(org.organizationId), label: org.name }))
  const items = data?.items ?? []
  const filtered = Boolean(debouncedSearch || priority || orgId || status !== 'Pending')

  function changeFilter(setter) {
    return (event) => {
      setter(event.target.value)
      setPage(1)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Staff Requests"
        description="Organizations ask for employees here. Approve a request, then allocate employees to staff it."
        actions={
          <Button onClick={() => navigate('/admin/requests/new')}>
            <Icon name="plus" size={18} /> New request
          </Button>
        }
      />

      <Notice message={notice} onClose={() => setNotice('')} />

      {summary && (
        <section className="finance-tiles" aria-label="Request summary">
          <article className={`card finance-tile ${summary.urgentPending > 0 ? 'finance-tile--danger' : ''}`}>
            <p className="finance-tile__label">Waiting for a decision</p>
            <p className="finance-tile__value">{summary.pending}</p>
            <p className="finance-tile__caption">{summary.urgentPending} high or critical</p>
          </article>
          <article className="card finance-tile">
            <p className="finance-tile__label">Approved, still short</p>
            <p className="finance-tile__value">{summary.approvedUnstaffed}</p>
            <p className="finance-tile__caption">need more employees allocated</p>
          </article>
          <article className="card finance-tile">
            <p className="finance-tile__label">Fully staffed</p>
            <p className="finance-tile__value">{summary.approvedStaffed}</p>
            <p className="finance-tile__caption">all employees allocated</p>
          </article>
          <article className="card finance-tile">
            <p className="finance-tile__label">Rejected</p>
            <p className="finance-tile__value">{summary.rejected}</p>
            <p className="finance-tile__caption">in total</p>
          </article>
        </section>
      )}

      <section className="card">
        <div className="toolbar">
          <TextField
            className="toolbar__search"
            label="Search requests"
            icon="search"
            placeholder="Search by organization or reason"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <SelectField className="toolbar__filter" label="Status" value={status} onChange={changeFilter(setStatus)} options={REQUEST_STATUS_OPTIONS} placeholder="All statuses" />
          <SelectField className="toolbar__filter" label="Priority" value={priority} onChange={changeFilter(setPriority)} options={TICKET_PRIORITY_OPTIONS} placeholder="All priorities" />
          <SelectField className="toolbar__filter" label="Organization" value={orgId} onChange={changeFilter(setOrgId)} options={organizationOptions} placeholder="All organizations" />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading requests..." />
        ) : items.length === 0 ? (
          <EmptyState
            icon="inbox"
            title={filtered ? 'No requests match' : 'No requests waiting'}
            text={filtered ? 'Try changing or clearing the filters.' : 'New requests for staff will appear here.'}
          />
        ) : (
          <>
            {error && <ErrorState error={error} onRetry={reload} />}
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th className="num">Staffed</th>
                    <th>Skill</th>
                    <th>Priority</th>
                    <th>Needed</th>
                    <th>Status</th>
                    <th>Logged</th>
                    <th>View</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((request) => (
                    <tr key={request.requestId} className={request.status === 'Rejected' || request.status === 'Cancelled' ? 'is-inactive' : ''}>
                      <td>
                        <span className="person__name">{request.orgName || `Request #${request.requestId}`}</span>
                        <span className="person__sub">{request.reason}</span>
                      </td>
                      <td className="num">
                        {request.staffedNow} / {request.requiredEmployees}
                      </td>
                      <td>{request.skillName || <span className="cell-muted">Any</span>}</td>
                      <td>
                        <PriorityBadge priority={request.priority} />
                      </td>
                      <td className="cell-date">
                        {formatDate(request.startDatetime)} – {formatDate(request.endDatetime)}
                      </td>
                      <td>
                        <WorkflowBadge status={request.status} />
                      </td>
                      <td className="cell-muted cell-date">{formatTimeAgo(request.createdAt)}</td>
<td>
  <ViewButton to={`/admin/requests/${request.requestId}`} label={`View request #${request.requestId}`} />
</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </section>

    </div>
  )
}

export default StaffRequestsPage
