import { useState } from 'react'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { TICKET_PRIORITY_OPTIONS } from '../../../constants/support.js'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { managerApi, managerRequestsApi } from '../../../services/manager/managerService.js'
import { formatDate, formatTimeAgo, formatDateTime } from '../../../utils/format.js'
import '../../admin/finance/FinanceTiles.css'
import { PriorityBadge } from '../../admin/queries/TicketBadges.jsx'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import ViewButton from '../../admin/shared/ViewButton.jsx'
import WorkflowBadge from '../../admin/shared/WorkflowBadge.jsx'
import { AllocateToRequestModal, NewRequestModal } from './ManagerRequestDialogs.jsx'

const PAGE_SIZE = 10

const STATUS_OPTIONS = [
  { value: 'Unstaffed', label: 'Approved, still short of employees' },
  { value: 'Pending', label: 'Waiting for your decision' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'Cancelled', label: 'Cancelled' },
]

/** Organization Manager: the staff requests of my organizations. Approved ones that are still short can be staffed by hand from the employee pool. */
function ManagerRequestsPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [orgId, setOrgId] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [allocating, setAllocating] = useState(null)
  const [notice, setNotice] = useFlashNotice()

  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), status, priority, orgId, page, pageSize: PAGE_SIZE }
  const { data, error, loading, reload } = useFetch((signal) => managerRequestsApi.list(params, signal), JSON.stringify(params))
  const { data: summary, reload: reloadSummary } = useFetch((signal) => managerRequestsApi.summary(signal), 'manager-request-summary')
  const { data: overview } = useFetch((signal) => managerApi.overview(signal), 'manager-overview')

  const organizations = overview?.organizations ?? []
  const organizationOptions = organizations.map((org) => ({ value: String(org.organizationId), label: org.name }))
  const items = data?.items ?? []
  const filtered = Boolean(debouncedSearch || status || priority || orgId)

  const changeFilter = (setter) => (event) => {
    setter(event.target.value)
    setPage(1)
  }

  return (
    <div className="page">
      <PageHeader
        title="Staff Requests"
        description="The extra employees your organizations ask for come here, to you. Open a request to approve or reject it, then press Allocate to choose the employees from the free pool (until the AI allocation is available)."
        actions={
          <Button onClick={() => setCreating(true)} disabled={organizations.length === 0}>
            <Icon name="plus" size={18} /> New request
          </Button>
        }
      />
      <Notice message={notice} onClose={() => setNotice('')} />

      {summary && (
        <section className="finance-tiles" aria-label="Overview">
          <article className="card finance-tile">
            <p className="finance-tile__label">Waiting for you</p>
            <p className="finance-tile__value">{summary.waiting}</p>
            <p className="finance-tile__caption">approve or reject them</p>
          </article>
          <article className={`card finance-tile ${summary.approvedShort > 0 ? 'finance-tile--gold' : ''}`}>
            <p className="finance-tile__label">Approved, still short</p>
            <p className="finance-tile__value">{summary.approvedShort}</p>
            <p className="finance-tile__caption">need employees from you</p>
          </article>
          <article className="card finance-tile">
            <p className="finance-tile__label">Fully staffed</p>
            <p className="finance-tile__value">{summary.fullyStaffed}</p>
          </article>
          <article className="card finance-tile">
            <p className="finance-tile__label">Rejected</p>
            <p className="finance-tile__value">{summary.rejected}</p>
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
          <SelectField className="toolbar__filter" label="Status" value={status} onChange={changeFilter(setStatus)} options={STATUS_OPTIONS} placeholder="All statuses" />
          <SelectField className="toolbar__filter" label="Priority" value={priority} onChange={changeFilter(setPriority)} options={TICKET_PRIORITY_OPTIONS} placeholder="All priorities" />
          {organizations.length > 1 && (
            <SelectField className="toolbar__filter" label="Organization" value={orgId} onChange={changeFilter(setOrgId)} options={organizationOptions} placeholder="All organizations" />
          )}
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading requests..." />
        ) : items.length === 0 ? (
          <EmptyState icon="inbox" title="No requests found" text={filtered ? 'Try changing or clearing the filters.' : 'No staff request has been made for your organizations yet.'} />
        ) : (
          <>
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Staffed</th>
                    <th>Skill</th>
                    <th>Priority</th>
                    <th>Needed</th>
                    <th>Status</th>
                    <th>Logged</th>
                    <th>View</th>
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((request) => {
                    const short = request.status === 'Approved' && request.staffedNow < (request.requiredEmployees ?? 0)
                    return (
                      <tr key={request.requestId}>
                        <td>
                          <strong>{request.orgName}</strong>
                          <span className="person__sub">{request.reason}</span>
                        </td>
                        <td>
                          {request.staffedNow} / {request.requiredEmployees}
                          {short && <span className="person__sub">needs {request.requiredEmployees - request.staffedNow} more</span>}
                        </td>
                        <td>{request.skillName || <span className="cell-muted">Any</span>}</td>
                        <td>
                          <PriorityBadge priority={request.priority} />
                        </td>
                        <td className="cell-muted" title={`${formatDateTime(request.startDatetime)} – ${formatDateTime(request.endDatetime)}`}>
                          {formatDate(request.startDatetime)} – {formatDate(request.endDatetime)}
                        </td>
                        <td>
                          <WorkflowBadge status={request.status} />
                        </td>
                        <td className="cell-muted">{formatTimeAgo(request.createdAt)}</td>
                        <td>
                          <ViewButton to={`/manager/requests/${request.requestId}`} label={`View request of ${request.orgName}`} />
                        </td>
                        <td>
                          {request.canStaff && <Button onClick={() => setAllocating(request)}>Allocate</Button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </section>

      {allocating && (
        <AllocateToRequestModal
          request={allocating}
          onClose={() => setAllocating(null)}
          onDone={(message) => {
            setNotice(message)
            reload()
            reloadSummary()
          }}
        />
      )}

      {creating && (
        <NewRequestModal
          organizations={organizations}
          onClose={() => setCreating(false)}
          onDone={(message) => {
            setCreating(false)
            setNotice(message)
            reload()
            reloadSummary()
          }}
        />
      )}
    </div>
  )
}

export default ManagerRequestsPage
