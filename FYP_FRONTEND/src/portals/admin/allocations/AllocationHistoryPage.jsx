import { useState } from 'react'
import { Link } from 'react-router-dom'
import Badge from '../../../components/ui/Badge.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { allocationHistoryApi, organizationsApi } from '../../../services/admin/adminService.js'
import { formatDateTime, humanize } from '../../../utils/format.js'
import PageHeader from '../shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'

const PAGE_SIZE = 15

const SOURCE_OPTIONS = [
  { value: 'ai', label: 'AI' },
  { value: 'manual', label: 'Manual (admin)' },
]

const ACTION_TONES = {
  Allocated: 'success',
  Reallocated: 'info',
  Released: 'neutral',
}

/** Local date (yyyy-mm-dd from the input) -> ISO UTC at local midnight. */
function dayStart(value) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : ''
}

/** The "to" day is inclusive, so send the start of the next day. */
function dayAfter(value) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + 1)
  return date.toISOString()
}

/** The complete allocation history. Nothing is ever overwritten; every move is a new row. */
function AllocationHistoryPage() {
  const [search, setSearch] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [action, setAction] = useState('')
  const [source, setSource] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebouncedValue(search)
  const params = {
    search: debouncedSearch.trim(),
    organizationId,
    action,
    source,
    from: dayStart(from),
    to: dayAfter(to),
    page,
    pageSize: PAGE_SIZE,
  }
  const { data, error, loading, reload } = useFetch((signal) => allocationHistoryApi.list(params, signal), JSON.stringify(params))
  const { data: organizations } = useFetch((signal) => organizationsApi.lookup(signal), 'organizations')
  const { data: actionTypes } = useFetch((signal) => allocationHistoryApi.actionTypes(signal), 'history-actions')

  const organizationOptions = (organizations ?? []).map((org) => ({ value: String(org.organizationId), label: org.name }))
  const actionOptions = (actionTypes ?? []).map((value) => ({ value, label: humanize(value) }))

  function changeFilter(setter) {
    return (event) => {
      setter(event.target.value)
      setPage(1)
    }
  }

  const items = data?.items ?? []
  const filtered = Boolean(debouncedSearch || organizationId || action || source || from || to)

  function clearFilters() {
    setSearch('')
    setOrganizationId('')
    setAction('')
    setSource('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  return (
    <div className="page">
      <PageHeader title="Allocation History" description="Every allocation, move and release, who did it and why." />

      <section className="card">
        <div className="toolbar">
          <TextField
            className="toolbar__search"
            label="Search employee"
            icon="search"
            placeholder="Search by employee name"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <SelectField className="toolbar__filter" label="Organization" value={organizationId} onChange={changeFilter(setOrganizationId)} options={organizationOptions} placeholder="All organizations" />
          <SelectField className="toolbar__filter" label="Action" value={action} onChange={changeFilter(setAction)} options={actionOptions} placeholder="All actions" />
          <SelectField className="toolbar__filter" label="Done by" value={source} onChange={changeFilter(setSource)} options={SOURCE_OPTIONS} placeholder="AI and manual" />
          <TextField className="toolbar__filter" label="From" type="date" max={to || undefined} value={from} onChange={changeFilter(setFrom)} />
          <TextField className="toolbar__filter" label="To" type="date" min={from || undefined} value={to} onChange={changeFilter(setTo)} error={from && to && to < from ? 'The end is before the start.' : undefined} />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading history..." />
        ) : items.length === 0 ? (
          <EmptyState
            icon="history"
            title="No history found"
            text={filtered ? 'No events match these filters.' : 'Allocation events will appear here as soon as employees are allocated.'}
            action={
              filtered ? (
                <button type="button" className="btn btn--secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null
            }
          />
        ) : (
          <>
            {error && <ErrorState error={error} onRetry={reload} />}
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Employee</th>
                    <th>Action</th>
                    <th>From → To</th>
                    <th>Reason</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((event) => {
                    const overridden = event.actionReason?.startsWith('[OVERRIDE]')
                    return (
                      <tr key={event.allocationHistoryId}>
                        <td className="cell-muted cell-date">{formatDateTime(event.actionTime)}</td>
                        <td>
                          {event.employeeId ? (
                            <Link className="person__name" to={`/admin/employees/${event.employeeId}`}>
                              {event.employeeName || `Employee #${event.employeeId}`}
                            </Link>
                          ) : (
                            '—'
                          )}
                          {event.allocationId && <span className="person__sub">Allocation #{event.allocationId}</span>}
                        </td>
                        <td>
                          <Badge tone={ACTION_TONES[event.actionType] || 'neutral'}>{humanize(event.actionType)}</Badge>
                        </td>
                        <td>
                          {event.fromOrgName || <span className="cell-muted">Central pool</span>} <Icon name="swap" size={13} /> {event.toOrgName || <span className="cell-muted">Central pool</span>}
                        </td>
                        <td style={{ maxWidth: '22rem' }}>
                          {overridden && <Badge tone="danger">Override</Badge>}{' '}
                          <span className="cell-muted">{(overridden ? event.actionReason.replace('[OVERRIDE]', '').trim() : event.actionReason) || '—'}</span>
                        </td>
                        <td>{event.isAllocatedByAi ? <Badge tone="info">AI</Badge> : <span>{event.performedBy || <span className="cell-muted">Manual</span>}</span>}</td>
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
    </div>
  )
}

export default AllocationHistoryPage
