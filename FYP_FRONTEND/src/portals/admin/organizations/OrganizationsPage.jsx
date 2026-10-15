import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { ORGANIZATION_STATUS_OPTIONS } from '../../../constants/contracts.js'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { organizationsApi } from '../../../services/admin/adminService.js'
import { formatDate, getInitials } from '../../../utils/format.js'
import { emailSentence } from '../../../utils/emailNote.js'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import DecisionModal from '../shared/DecisionModal.jsx'
import Notice from '../shared/Notice.jsx'
import OrganizationFormModal from './OrganizationFormModal.jsx'
import PageHeader from '../shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'
import WorkflowBadge from '../shared/WorkflowBadge.jsx'
import ViewButton from '../shared/ViewButton.jsx'

const PAGE_SIZE = 10

function OrganizationsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [formTarget, setFormTarget] = useState(null) // null | 'new' | organization
  const [approveTarget, setApproveTarget] = useState(null)
  const location = useLocation()
  const [notice, setNotice] = useState(location.state?.message ?? '')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), status, page, pageSize: PAGE_SIZE }
  const { data, error, loading, reload } = useFetch((signal) => organizationsApi.list(params, signal), JSON.stringify(params))

  function handleSaved(message) {
    setFormTarget(null)
    setNotice(message)
    reload()
  }

  async function handleApprove(reason) {
    const result = await organizationsApi.approve(approveTarget.organizationId, reason)
    setNotice(`${approveTarget.name} was approved.${emailSentence(result)}`)
    setApproveTarget(null)
    reload()
  }

  async function handleDelete() {
    const result = await organizationsApi.remove(deleteTarget.organizationId)
    setNotice(result?.message || `${deleteTarget.name} was deleted.`)
    setDeleteTarget(null)
    reload()
  }

  const items = data?.items ?? []
  const filtered = Boolean(debouncedSearch) || Boolean(status)

  return (
    <div className="page">
      <PageHeader
        title="Organizations"
        description="Verify new organizations and manage your clients."
        actions={
          <Button onClick={() => navigate('/admin/organizations/new')}>
            <Icon name="plus" size={18} /> Add organization
          </Button>
        }
      />

      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card">
        <div className="toolbar">
          <TextField
            className="toolbar__search"
            label="Search organizations"
            icon="search"
            placeholder="Search by name, email or country"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <SelectField
            className="toolbar__filter"
            label="Status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setPage(1)
            }}
            options={ORGANIZATION_STATUS_OPTIONS}
            placeholder="All statuses"
          />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading organizations..." />
        ) : items.length === 0 ? (
          <EmptyState
            icon="building"
            title="No organizations found"
            text={filtered ? 'Try changing or clearing the filters.' : 'Add your first client organization to get started.'}
            action={
              filtered ? null : (
                <Button onClick={() => navigate('/admin/organizations/new')}>
                  <Icon name="plus" size={18} /> Add organization
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
                    <th>Organization</th>
                    <th>Country</th>
                    <th>Employees</th>
                    <th>Contracts</th>
                    <th>Status</th>
                    <th>Registered</th>
                    <th>View</th>
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((org) => (
                    <tr key={org.organizationId}>
                      <td>
                        <div className="person">
                          <span className="avatar" aria-hidden="true">
                            {getInitials(org.name)}
                          </span>
                          <span>
                            <span className="person__name">{org.name}</span>
                            <span className="person__sub">{org.email}</span>
                          </span>
                        </div>
                      </td>
                      <td className="cell-muted">{org.country || '—'}</td>
                      <td>{org.employeeCount}</td>
                      <td>
                        {org.activeContractCount} active
                        <span className="cell-muted"> / {org.contractCount}</span>
                      </td>
                      <td>
                        <WorkflowBadge status={org.status} />
                      </td>
                      <td className="cell-muted">{formatDate(org.createdAt)}</td>
                      <td>
                        <ViewButton to={`/admin/organizations/${org.organizationId}`} label={`View ${org.name}`} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {org.status === 'Pending' && (
                            <button type="button" className="icon-btn" onClick={() => setApproveTarget(org)} aria-label={`Approve ${org.name}`} title="Approve">
                              <Icon name="checkCircle" size={17} />
                            </button>
                          )}
                          <button type="button" className="icon-btn" onClick={() => setFormTarget(org)} aria-label={`Edit ${org.name}`} title="Edit">
                            <Icon name="edit" size={17} />
                          </button>
                          <button type="button" className="icon-btn icon-btn--danger" onClick={() => setDeleteTarget(org)} aria-label={`Delete ${org.name}`} title="Delete">
                            <Icon name="trash" size={17} />
                          </button>
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

      {formTarget && (
        <OrganizationFormModal
          organization={formTarget === 'new' ? null : formTarget}
          onClose={() => setFormTarget(null)}
          onSaved={handleSaved}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete organization?"
          message={`${deleteTarget.name} will be removed for good, together with its manager links and any contract that was never approved. This cannot be undone. Organizations that already have employees, approved contracts, invoices, allocations or tickets cannot be deleted; suspend them instead.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {approveTarget && (
        <DecisionModal
          title="Approve organization?"
          description={`${approveTarget.name} will become active and can receive contracts.`}
          label="Note"
          confirmLabel="Approve"
          onSubmit={handleApprove}
          onClose={() => setApproveTarget(null)}
        />
      )}
    </div>
  )
}

export default OrganizationsPage
