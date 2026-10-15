import { useState } from 'react'
import { Link } from 'react-router-dom'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { auditApi } from '../../../services/admin/adminService.js'
import { formatDateTime, humanize } from '../../../utils/format.js'
import { actionTone, entityLink } from '../shared/auditLinks.js'
import PageHeader from '../shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'

const PAGE_SIZE = 20

/** Local day (yyyy-mm-dd from the input) -> ISO UTC at local midnight. */
function dayStart(value) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : ''
}

function dayAfter(value) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + 1)
  return date.toISOString()
}

/** Who did what and when, for every sensitive admin action. Read-only. */
function AuditLogsPage() {
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [actorUserId, setActorUserId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), action, entityType, actorUserId, from: dayStart(from), to: dayAfter(to), page, pageSize: PAGE_SIZE }
  const { data, error, loading, reload } = useFetch((signal) => auditApi.list(params, signal), JSON.stringify(params))
  const { data: facets } = useFetch((signal) => auditApi.facets(signal), 'audit-facets')

  const actionOptions = (facets?.actions ?? []).map((value) => ({ value, label: humanize(value) }))
  const typeOptions = (facets?.entityTypes ?? []).map((value) => ({ value, label: value }))
  const actorOptions = (facets?.actors ?? []).map((actor) => ({ value: String(actor.userId), label: actor.name || `User #${actor.userId}` }))
  const items = data?.items ?? []
  const filtered = Boolean(debouncedSearch || action || entityType || actorUserId || from || to)

  function changeFilter(setter) {
    return (event) => {
      setter(event.target.value)
      setPage(1)
    }
  }

  function clearFilters() {
    setSearch('')
    setAction('')
    setEntityType('')
    setActorUserId('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  return (
    <div className="page">
      <PageHeader title="Audit Logs" description="A permanent record of important admin actions: who did what, to which item, and when." />

      <section className="card">
        <div className="toolbar">
          <TextField
            className="toolbar__search"
            label="Search"
            icon="search"
            placeholder="Search details, action, person or item number"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <SelectField className="toolbar__filter" label="Action" value={action} onChange={changeFilter(setAction)} options={actionOptions} placeholder="All actions" />
          <SelectField className="toolbar__filter" label="Item type" value={entityType} onChange={changeFilter(setEntityType)} options={typeOptions} placeholder="All types" />
          <SelectField className="toolbar__filter" label="Done by" value={actorUserId} onChange={changeFilter(setActorUserId)} options={actorOptions} placeholder="Anyone" />
          <TextField className="toolbar__filter" label="From" type="date" max={to || undefined} value={from} onChange={changeFilter(setFrom)} />
          <TextField className="toolbar__filter" label="To" type="date" min={from || undefined} value={to} onChange={changeFilter(setTo)} error={from && to && to < from ? 'The end is before the start.' : undefined} />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading audit log..." />
        ) : items.length === 0 ? (
          <EmptyState
            icon="shield"
            title={filtered ? 'No entries match' : 'No entries yet'}
            text={filtered ? 'Try changing or clearing the filters.' : 'Actions such as creating employees, approving contracts or recording payments are listed here.'}
            action={
              filtered ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
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
                    <th>Who</th>
                    <th>Action</th>
                    <th>Item</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((entry) => {
                    const link = entry.entityType && entry.entityId ? entityLink(entry.entityType, entry.entityId) : null
                    return (
                      <tr key={entry.auditId}>
                        <td className="cell-muted cell-date">{formatDateTime(entry.createdAt)}</td>
                        <td>
                          {entry.actorName || <span className="cell-muted">System</span>}
                          {entry.ipAddress && <span className="person__sub">{entry.ipAddress}</span>}
                        </td>
                        <td>
                          <Badge tone={actionTone(entry.action)}>{humanize(entry.action.toLowerCase().replace(/_/g, ' '))}</Badge>
                        </td>
                        <td className="cell-date">
                          {entry.entityType ? (
                            link ? (
                              <Link to={link}>
                                {entry.entityType} #{entry.entityId}
                              </Link>
                            ) : (
                              <>
                                {entry.entityType} {entry.entityId ? `#${entry.entityId}` : ''}
                              </>
                            )
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="cell-muted" style={{ maxWidth: '28rem', wordBreak: 'break-word' }}>
                          {entry.details || '—'}
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
    </div>
  )
}

export default AuditLogsPage
