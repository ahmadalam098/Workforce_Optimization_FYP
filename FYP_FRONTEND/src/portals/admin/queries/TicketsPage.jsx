import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { QUERY_CATEGORY_OPTIONS, QUERY_STATUS_OPTIONS } from '../../../constants/support.js'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { organizationsApi, ticketsApi } from '../../../services/admin/adminService.js'
import { formatDateTime, formatTimeAgo } from '../../../utils/format.js'
import Notice from '../shared/Notice.jsx'
import PageHeader from '../shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'
import { CategoryBadge, ForwardedBadge, PriorityBadge, SourceBadge, TicketStatusBadge } from './TicketBadges.jsx'
import ViewButton from '../shared/ViewButton.jsx'
import '../finance/FinanceTiles.css'

const PAGE_SIZE = 10

/** Queries from organizations: look at a query and resolve it with a comment. */
const SOURCE_OPTIONS = [
  { value: 'Organization', label: 'Organizations' },
  { value: 'Employee', label: 'Employees' },
]

function TicketsPage() {
  const navigate = useNavigate()
  const [notice, setNotice] = useFlashNotice()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('Open')
  const [organizationId, setOrganizationId] = useState('')
  const [fromManagers, setFromManagers] = useState('')
  const [source, setSource] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), status, organizationId, forwarded: fromManagers, source, category, page, pageSize: PAGE_SIZE }
  const { data, error, loading, reload } = useFetch((signal) => ticketsApi.list(params, signal), JSON.stringify(params))
  const { data: summary } = useFetch((signal) => ticketsApi.summary(signal), 'ticket-summary')
  const { data: organizations } = useFetch((signal) => organizationsApi.lookup(signal), 'organizations')

  const organizationOptions = (organizations ?? []).map((org) => ({ value: String(org.organizationId), label: org.name }))
  const items = data?.items ?? []
  const filtered = Boolean(debouncedSearch || organizationId || fromManagers || source || category || status !== 'Open')

  function changeFilter(setter) {
    return (event) => {
      setter(event.target.value)
      setPage(1)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Queries"
        description="Queries from organizations. Open one to read it, then resolve it with a comment; the organization is emailed your comment."
        actions={
          <Button onClick={() => navigate('/admin/tickets/new')}>
            <Icon name="plus" size={18} /> Add query
          </Button>
        }
      />
      <Notice message={notice} onClose={() => setNotice('')} />

      {summary && (
        <section className="finance-tiles" aria-label="Query summary">
          <article className="card finance-tile">
            <p className="finance-tile__label">Open</p>
            <p className="finance-tile__value">{summary.open}</p>
            <p className="finance-tile__caption">waiting for an answer</p>
          </article>
          <article className="card finance-tile">
            <p className="finance-tile__label">Resolved</p>
            <p className="finance-tile__value">{summary.resolved}</p>
            <p className="finance-tile__caption">{summary.averageResolutionHours > 0 ? `${summary.averageResolutionHours} h average to resolve` : 'nothing resolved yet'}</p>
          </article>
        </section>
      )}

      <section className="card">
        <div className="toolbar">
          <TextField
            className="toolbar__search"
            label="Search queries"
            icon="search"
            placeholder="Search by number, subject or organization"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <SelectField className="toolbar__filter" label="Status" value={status} onChange={changeFilter(setStatus)} options={QUERY_STATUS_OPTIONS} placeholder="All" />
          <SelectField className="toolbar__filter" label="From" value={source} onChange={changeFilter(setSource)} options={SOURCE_OPTIONS} placeholder="Employees and organizations" />
          <SelectField className="toolbar__filter" label="Type" value={category} onChange={changeFilter(setCategory)} options={QUERY_CATEGORY_OPTIONS} placeholder="All types" />
          <SelectField className="toolbar__filter" label="Sent by managers" value={fromManagers} onChange={changeFilter(setFromManagers)} options={[{ value: 'true', label: 'Only those sent to me' }]} placeholder="All" />
          <SelectField className="toolbar__filter" label="Organization" value={organizationId} onChange={changeFilter(setOrganizationId)} options={organizationOptions} placeholder="All organizations" />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading queries..." />
        ) : items.length === 0 ? (
          <EmptyState
            icon="inbox"
            title={filtered ? 'No queries match' : 'No open queries'}
            text={filtered ? 'Try changing or clearing the filters.' : 'Queries sent by organizations will appear here.'}
          />
        ) : (
          <>
            {error && <ErrorState error={error} onRetry={reload} />}
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Query</th>
                    <th>Type</th>
                    <th>From</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Opened</th>
                    <th>View</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((ticket) => (
                    <tr key={ticket.ticketId} className={ticket.status === 'Resolved' ? 'is-inactive' : ''}>
                      <td style={{ maxWidth: '24rem' }}>
                        <span className="person__name">{ticket.subject}</span>
                        <span className="person__sub">
                          {ticket.ticketNumber}
                        </span>
                      </td>
                      <td>
                        <CategoryBadge category={ticket.category} />
                      </td>
                      <td>
                        <SourceBadge ticket={ticket} />
                        <span className="person__name">{ticket.source === 'Employee' ? ticket.raisedBy || '—' : ticket.orgName || '—'}</span>
                        {ticket.source === 'Employee' && ticket.orgName && <span className="person__sub">{ticket.orgName}</span>}
                        {ticket.source === 'Manager' && ticket.raisedBy && <span className="person__sub">logged by {ticket.raisedBy}</span>}
                      </td>
                      <td>
                        <PriorityBadge priority={ticket.priority} />
                      </td>
                      <td>
                        <TicketStatusBadge status={ticket.status} />
                        <ForwardedBadge ticket={ticket} />
                      </td>
                      <td className="cell-muted cell-date" title={formatDateTime(ticket.createdAt)}>
                        {formatTimeAgo(ticket.createdAt)}
                      </td>
                      <td>
                        <ViewButton to={`/admin/tickets/${ticket.ticketId}`} label={`View query ${ticket.ticketNumber}`} />
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

export default TicketsPage
