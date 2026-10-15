import Avatar from '../../../components/ui/Avatar.jsx'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { allocationsApi, organizationsApi } from '../../../services/admin/adminService.js'
import { formatDateTime } from '../../../utils/format.js'
import AllocateModal from './AllocateModal.jsx'
import DecisionModal from '../shared/DecisionModal.jsx'
import Notice from '../shared/Notice.jsx'
import PageHeader from '../shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'
import WorkflowBadge from '../shared/WorkflowBadge.jsx'

const PAGE_SIZE = 10

const STATE_OPTIONS = [
  { value: 'open', label: 'Active' },
  { value: 'closed', label: 'Ended' },
  { value: 'all', label: 'All' },
]

const TYPE_OPTIONS = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Temporary', label: 'Borrowed' },
]

/** Current allocations, plus the manual workflow: allocate, reallocate and release. */
function AllocationsPage() {
  const [state, setState] = useState('open')
  const [search, setSearch] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const [allocating, setAllocating] = useState(false)
  const [reallocateTarget, setReallocateTarget] = useState(null)
  const [releaseTarget, setReleaseTarget] = useState(null)
  const [notice, setNotice] = useState('')

  const debouncedSearch = useDebouncedValue(search)
  const params = { state, search: debouncedSearch.trim(), organizationId, type, page, pageSize: PAGE_SIZE }
  const { data, error, loading, reload } = useFetch((signal) => allocationsApi.list(params, signal), JSON.stringify(params))
  const { data: organizations } = useFetch((signal) => organizationsApi.lookup(signal), 'organizations')

  const organizationOptions = (organizations ?? []).map((org) => ({ value: String(org.organizationId), label: org.name }))

  function changeFilter(setter) {
    return (event) => {
      setter(event.target.value)
      setPage(1)
    }
  }

  function done(message) {
    setAllocating(false)
    setReallocateTarget(null)
    setNotice(message)
    reload()
  }

  async function handleRelease(reason) {
    const result = await allocationsApi.release(releaseTarget.allocationId, reason)
    setReleaseTarget(null)
    setNotice(result?.message || 'Employee released.')
    reload()
  }

  const items = data?.items ?? []
  const filtered = Boolean(debouncedSearch) || Boolean(organizationId) || Boolean(type) || state !== 'open'

  return (
    <div className="page">
      <PageHeader
        title="Allocations"
        description="Who works for which organization right now. Place, move or release employees yourself when the AI needs overriding."
        actions={
          <Button onClick={() => setAllocating(true)}>
            <Icon name="plus" size={18} /> New allocation
          </Button>
        }
      />

      <Notice message={notice} onClose={() => setNotice('')} />

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
          <SelectField className="toolbar__filter" label="Show" value={state} onChange={changeFilter(setState)} options={STATE_OPTIONS} />
          <SelectField className="toolbar__filter" label="Organization" value={organizationId} onChange={changeFilter(setOrganizationId)} options={organizationOptions} placeholder="All organizations" />
          <SelectField className="toolbar__filter" label="Type" value={type} onChange={changeFilter(setType)} options={TYPE_OPTIONS} placeholder="All types" />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading allocations..." />
        ) : items.length === 0 ? (
          <EmptyState
            icon="swap"
            title="No allocations found"
            text={filtered ? 'Try changing or clearing the filters.' : 'Allocate an employee to an organization to get started.'}
            action={
              filtered ? null : (
                <Button onClick={() => setAllocating(true)}>
                  <Icon name="plus" size={18} /> New allocation
                </Button>
              )
            }
          />
        ) : (
          <>
            {error && <ErrorState error={error} onRetry={reload} />}
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Owner → Working at</th>
                    <th>Type</th>
                    <th>Started</th>
                    <th>Expected end</th>
                    <th>Status</th>
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.allocationId} className={item.isOpen ? '' : 'is-inactive'}>
                      <td>
                        <div className="person">
                          <Avatar userId={item.userId} name={item.employeeName} hasPicture={item.hasPicture} />
                          <span>
                            {item.employeeId ? (
                              <Link className="person__name" to={`/admin/employees/${item.employeeId}`}>
                                {item.employeeName}
                              </Link>
                            ) : (
                              <span className="person__name">{item.employeeName}</span>
                            )}
                            <span className="person__sub">Allocation #{item.allocationId}</span>
                          </span>
                        </div>
                      </td>
                      <td>
                        {item.isShared ? (
                          <>
                            {item.ownerOrgName} <Icon name="swap" size={14} /> <strong>{item.assignOrgName}</strong>
                          </>
                        ) : (
                          <strong>{item.assignOrgName || '—'}</strong>
                        )}
                      </td>
                      <td>
                        {item.isShared ? <Badge tone="info">Borrowed</Badge> : <Badge>{item.allocationType || 'Normal'}</Badge>}
                      </td>
                      <td className="cell-muted cell-date">{formatDateTime(item.startDatetime)}</td>
                      <td className="cell-muted cell-date">{item.expectedEndDatetime ? formatDateTime(item.expectedEndDatetime) : "—"}</td>
                      <td>
                        <div className="chip-list">
                          <WorkflowBadge status={item.status || 'Active'} />
                          {!item.isOpen && item.actualEndDatetime && <span className="person__sub">Ended {formatDateTime(item.actualEndDatetime)}</span>}
                        </div>
                      </td>
                      <td>
                        {item.isOpen && (
                          <div className="row-actions">
                            <button type="button" className="icon-btn" onClick={() => setReallocateTarget(item)} aria-label={`Reallocate ${item.employeeName}`} title="Reallocate">
                              <Icon name="swap" size={17} />
                            </button>
                            <button type="button" className="icon-btn icon-btn--danger" onClick={() => setReleaseTarget(item)} aria-label={`Release ${item.employeeName}`} title="Release">
                              <Icon name="close" size={17} />
                            </button>
                          </div>
                        )}
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

      {allocating && <AllocateModal organizations={organizations ?? []} onClose={() => setAllocating(false)} onDone={done} />}

      {reallocateTarget && (
        <AllocateModal mode="reallocate" allocation={reallocateTarget} organizations={organizations ?? []} onClose={() => setReallocateTarget(null)} onDone={done} />
      )}

      {releaseTarget && (
        <DecisionModal
          title="Release employee?"
          description={`${releaseTarget.employeeName} stops working for ${releaseTarget.assignOrgName} and becomes available again.`}
          label="Reason"
          required
          confirmLabel="Release"
          danger
          onSubmit={handleRelease}
          onClose={() => setReleaseTarget(null)}
        />
      )}

    </div>
  )
}

export default AllocationsPage
