import { useState } from 'react'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { TICKET_TYPE_OPTIONS } from '../../../constants/support.js'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { managerApi, managerTicketsApi } from '../../../services/manager/managerService.js'
import { formatDateTime, formatTimeAgo } from '../../../utils/format.js'
import '../../admin/finance/FinanceTiles.css'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import ViewButton from '../../admin/shared/ViewButton.jsx'
import { PriorityBadge, TicketStatusBadge } from '../../admin/queries/TicketBadges.jsx'
import { LogTicketModal, ResolveEmployeeQueryModal, SendToAdminModal } from './ManagerTicketModals.jsx'

const PAGE_SIZE = 10

const STATUS_OPTIONS = [
  { value: 'Open', label: 'Open' },
  { value: 'Resolved', label: 'Resolved' },
]

const SOURCE_OPTIONS = [
  { value: 'Employee', label: 'Employees' },
  { value: 'Organization', label: 'Organizations' },
]

const SENT_OPTIONS = [
  { value: 'false', label: 'Not sent to the admin' },
  { value: 'true', label: 'Sent to the admin' },
]

const SEVERITY_OPTIONS = [{ value: 'true', label: 'Severe only (High, Critical)' }]

export function SentBadge({ ticket }) {
  return ticket.forwardedAt ? (
    <Badge tone="gold" dot>
      Sent to admin
    </Badge>
  ) : (
    <span className="cell-muted">Not sent</span>
  )
}

/** Who a query comes from: an employee (with the name) or an organization. */
export function FromBadge({ ticket }) {
  return ticket.source === 'Employee' ? <Badge tone="info">Employee</Badge> : <Badge tone="neutral">Organization</Badge>
}

/** Organization Manager: queries and complaints of my organizations and my employees. Answer the ordinary ones, send the severe ones to the admin. */
function ManagerQueriesPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [source, setSource] = useState('')
  const [status, setStatus] = useState('Open')
  const [organizationId, setOrganizationId] = useState('')
  const [forwarded, setForwarded] = useState('')
  const [severe, setSevere] = useState('')
  const [page, setPage] = useState(1)
  const [sendTarget, setSendTarget] = useState(null)
  const [resolveTarget, setResolveTarget] = useState(null)
  const [logging, setLogging] = useState(false)
  const [notice, setNotice] = useFlashNotice()

  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), category, source, status, organizationId, forwarded, severe, page, pageSize: PAGE_SIZE }

  const { data, error, loading, reload } = useFetch((signal) => managerTicketsApi.list(params, signal), JSON.stringify(params))
  const { data: summary, reload: reloadSummary } = useFetch((signal) => managerTicketsApi.summary(signal), 'manager-ticket-summary')
  const { data: overview } = useFetch((signal) => managerApi.overview(signal), 'manager-overview')

  const organizations = overview?.organizations ?? []
  const organizationOptions = organizations.map((org) => ({ value: String(org.organizationId), label: org.name }))
  const items = data?.items ?? []
  const filtered = Boolean(debouncedSearch || category || source || organizationId || forwarded || severe || status !== 'Open')

  const changeFilter = (setter) => (event) => {
    setter(event.target.value)
    setPage(1)
  }

  function done(message) {
    setSendTarget(null)
    setResolveTarget(null)
    setLogging(false)
    setNotice(message)
    reload()
    reloadSummary()
  }

  return (
    <div className="page">
      <PageHeader
        title="Queries & Complaints"
        description="What your organizations and your employees asked or complained about. Answer the ordinary ones yourself; send the severe ones to the admin."
        actions={
          <Button onClick={() => setLogging(true)} disabled={organizations.length === 0}>
            <Icon name="plus" size={18} /> Log new
          </Button>
        }
      />
      <Notice message={notice} onClose={() => setNotice('')} />

      {summary && (
        <section className="finance-tiles" aria-label="Overview">
          <article className="card finance-tile">
            <p className="finance-tile__label">Employee queries</p>
            <p className="finance-tile__value">{summary.openEmployeeQueries}</p>
            <p className="finance-tile__caption">open, waiting for you</p>
          </article>
          <article className={`card finance-tile ${summary.severeToSend > 0 ? 'finance-tile--danger' : ''}`}>
            <p className="finance-tile__label">Severe, not sent to the admin</p>
            <p className="finance-tile__value">{summary.severeToSend}</p>
            <p className="finance-tile__caption">High or Critical severity</p>
          </article>
          <article className="card finance-tile">
            <p className="finance-tile__label">Organization queries / complaints</p>
            <p className="finance-tile__value">
              {summary.openQueries} / {summary.openComplaints}
            </p>
            <p className="finance-tile__caption">open</p>
          </article>
          <article className={`card finance-tile ${summary.notSentToAdmin > 0 ? 'finance-tile--gold' : ''}`}>
            <p className="finance-tile__label">Sent to the admin</p>
            <p className="finance-tile__value">{summary.sentToAdmin}</p>
            <p className="finance-tile__caption">{summary.resolved} resolved in total</p>
          </article>
        </section>
      )}

      <section className="card">
        <div className="toolbar">
          <TextField
            className="toolbar__search"
            label="Search"
            icon="search"
            placeholder="Search by number, subject or organization"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <SelectField className="toolbar__filter" label="From" value={source} onChange={changeFilter(setSource)} options={SOURCE_OPTIONS} placeholder="Everyone" />
          <SelectField className="toolbar__filter" label="Type" value={category} onChange={changeFilter(setCategory)} options={TICKET_TYPE_OPTIONS} placeholder="All" />
          <SelectField className="toolbar__filter" label="Severity" value={severe} onChange={changeFilter(setSevere)} options={SEVERITY_OPTIONS} placeholder="All" />
          <SelectField className="toolbar__filter" label="Status" value={status} onChange={changeFilter(setStatus)} options={STATUS_OPTIONS} placeholder="All" />
          <SelectField className="toolbar__filter" label="Admin" value={forwarded} onChange={changeFilter(setForwarded)} options={SENT_OPTIONS} placeholder="All" />
          {organizations.length > 1 && (
            <SelectField className="toolbar__filter" label="Organization" value={organizationId} onChange={changeFilter(setOrganizationId)} options={organizationOptions} placeholder="All organizations" />
          )}
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading..." />
        ) : items.length === 0 ? (
          <EmptyState icon="inbox" title="Nothing found" text={filtered ? 'Try changing or clearing the filters.' : 'No query or complaint has been recorded for your organizations or employees yet.'} />
        ) : (
          <>
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>From</th>
                    <th>Type</th>
                    <th>Organization</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Admin</th>
                    <th>Received</th>
                    <th>View</th>
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((ticket) => (
                    <tr key={ticket.ticketId} className={ticket.status === 'Resolved' ? 'is-inactive' : ''}>
                      <td>
                        <strong>{ticket.subject}</strong>
                        <span className="person__sub">{ticket.ticketNumber}</span>
                      </td>
                      <td>
                        <FromBadge ticket={ticket} />
                        {ticket.raisedBy && <span className="person__sub">{ticket.raisedBy}</span>}
                      </td>
                      <td>
                        <Badge tone={ticket.category === 'Complaint' ? 'danger' : 'info'}>{ticket.category}</Badge>
                      </td>
                      <td>{ticket.orgName || <span className="cell-muted">—</span>}</td>
                      <td>
                        <PriorityBadge priority={ticket.priority} />
                        {ticket.isSevere && <span className="person__sub">Severe</span>}
                      </td>
                      <td>
                        <TicketStatusBadge status={ticket.status} />
                      </td>
                      <td>
                        <SentBadge ticket={ticket} />
                      </td>
                      <td className="cell-muted cell-date" title={formatDateTime(ticket.createdAt)}>
                        {formatTimeAgo(ticket.createdAt)}
                      </td>
                      <td>
                        <ViewButton to={`/manager/queries/${ticket.ticketId}`} label={`View ${ticket.ticketNumber}`} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {ticket.canResolve && <Button onClick={() => setResolveTarget(ticket)}>Answer</Button>}
                          {ticket.canForward && (
                            <Button variant="secondary" onClick={() => setSendTarget(ticket)}>
                              Send to admin
                            </Button>
                          )}
                        </div>
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

      {sendTarget && <SendToAdminModal ticket={sendTarget} onClose={() => setSendTarget(null)} onDone={done} />}
      {resolveTarget && <ResolveEmployeeQueryModal ticket={resolveTarget} onClose={() => setResolveTarget(null)} onDone={done} />}
      {logging && <LogTicketModal organizations={organizations} onClose={() => setLogging(false)} onDone={done} />}
    </div>
  )
}

export default ManagerQueriesPage
