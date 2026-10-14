import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { CONTRACT_STATUS_OPTIONS } from '../../../constants/contracts.js'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { contractsApi, organizationsApi } from '../../../services/adminService.js'
import { formatMoney } from '../../../utils/format.js'
import { formatPeriod, formatStaffRange } from '../../../utils/contractFormat.js'
import ContractFormModal from '../components/ContractFormModal.jsx'
import Notice from '../components/Notice.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { EmptyState, ErrorState } from '../components/StateBox.jsx'
import WorkflowBadge from '../components/WorkflowBadge.jsx'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import ViewButton from '../components/ViewButton.jsx'

const PAGE_SIZE = 10

// Pending contracts are edited in place; approved (or suspended) ones are saved as a new version.
const canEdit = (status) => ['Pending', 'Active', 'Approved', 'Suspended'].includes(status)

function ContractsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useFlashNotice()
  const [editTarget, setEditTarget] = useState(null) // the full contract being edited
  const [loadingEditId, setLoadingEditId] = useState(null)
  const [editError, setEditError] = useState('')

  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), status, organizationId, page, pageSize: PAGE_SIZE }
  const { data, error, loading, reload } = useFetch((signal) => contractsApi.list(params, signal), JSON.stringify(params))
  const { data: organizations } = useFetch((signal) => organizationsApi.lookup(signal), 'organizations')

  // The list rows have only a summary, so the whole contract is fetched when Edit is pressed.
  async function startEdit(contract) {
    setLoadingEditId(contract.contractId)
    setEditError('')
    try {
      setEditTarget(await contractsApi.get(contract.contractId))
    } catch (err) {
      setEditError(err.message)
    } finally {
      setLoadingEditId(null)
    }
  }

  const organizationOptions = (organizations ?? []).map((org) => ({
    value: String(org.organizationId),
    label: org.name || `Organization #${org.organizationId}`,
  }))
  const approvedOrganizations = (organizations ?? []).filter((org) => org.status === 'Active' || org.status === 'Approved')

  function changeFilter(setter) {
    return (event) => {
      setter(event.target.value)
      setPage(1)
    }
  }

  const items = data?.items ?? []
  const filtered = Boolean(debouncedSearch) || Boolean(status) || Boolean(organizationId)

  return (
    <div className="page">
      <PageHeader
        title="Contracts"
        description="Agreements with client organizations: staffing, borrowing and payment terms."
        actions={
          <Button onClick={() => navigate('/admin/contracts/new')}>
            <Icon name="plus" size={18} /> New contract
          </Button>
        }
      />

      <Notice message={notice} onClose={() => setNotice('')} />
      {editError && <Alert type="error" onClose={() => setEditError('')}>{editError}</Alert>}

      <section className="card">
        <div className="toolbar">
          <TextField
            className="toolbar__search"
            label="Search contracts"
            icon="search"
            placeholder="Search by contract number or organization"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <SelectField className="toolbar__filter" label="Status" value={status} onChange={changeFilter(setStatus)} options={CONTRACT_STATUS_OPTIONS} placeholder="All statuses" />
          <SelectField className="toolbar__filter" label="Organization" value={organizationId} onChange={changeFilter(setOrganizationId)} options={organizationOptions} placeholder="All organizations" />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading contracts..." />
        ) : items.length === 0 ? (
          <EmptyState
            icon="file"
            title="No contracts found"
            text={filtered ? 'Try changing or clearing the filters.' : 'Create the first contract for an approved organization.'}
            action={
              filtered ? null : (
                <Button onClick={() => navigate('/admin/contracts/new')}>
                  <Icon name="plus" size={18} /> New contract
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
                    <th>Contract</th>
                    <th>Organization</th>
                    <th>Period</th>
                    <th>Employees</th>
                    <th>Rates</th>
                    <th>Status</th>
                    <th>View</th>
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((contract) => (
                    <tr key={contract.contractId}>
                      <td>
                        <span className="person__name">{contract.contractNumber || `#${contract.contractId}`}</span>
                        <span className="person__sub">Version {contract.versionNo}</span>
                      </td>
                      <td>
                        {contract.organizationId ? (
                          <Link to={`/admin/organizations/${contract.organizationId}`}>{contract.organizationName}</Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="cell-muted">{formatPeriod(contract.startDate, contract.endDate)}</td>
                      <td>{formatStaffRange(contract.minEmployees, contract.maxEmployees)}</td>
                      <td>
                        {contract.baseHourlyRate != null ? (
                          <>
                            {formatMoney(contract.baseHourlyRate)}
                            <span className="cell-muted">
                              {contract.extraHourlyRate != null ? ` / ${formatMoney(contract.extraHourlyRate)}` : ''} {contract.billingCurrency}
                            </span>
                          </>
                        ) : (
                          <span className="cell-muted">—</span>
                        )}
                      </td>
                      <td>
                        <div className="chip-list">
                          <WorkflowBadge status={contract.status} />
                        </div>
                      </td>
                      <td>
                        <ViewButton to={`/admin/contracts/${contract.contractId}`} label={`View contract ${contract.contractNumber || contract.contractId}`} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {canEdit(contract.status) && (
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => startEdit(contract)}
                              disabled={loadingEditId === contract.contractId}
                              aria-label={`Edit ${contract.contractNumber || `contract ${contract.contractId}`}`}
                              title="Edit contract"
                            >
                              <Icon name="edit" size={17} />
                            </button>
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

      {editTarget && (
        <ContractFormModal
          contract={editTarget}
          organizations={approvedOrganizations}
          onClose={() => setEditTarget(null)}
          onSaved={(message) => {
            setEditTarget(null)
            setNotice(message)
            reload()
          }}
        />
      )}

    </div>
  )
}

export default ContractsPage
