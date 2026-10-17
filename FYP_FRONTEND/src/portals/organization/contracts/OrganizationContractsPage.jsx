import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { organizationContractsApi } from '../../../services/organization/organizationService.js'
import { formatDate } from '../../../utils/format.js'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import ViewButton from '../../admin/shared/ViewButton.jsx'
import WorkflowBadge from '../../admin/shared/WorkflowBadge.jsx'
import OrganizationContractFormModal from './OrganizationContractFormModal.jsx'

/** Organization: the contracts it asked for, and a button to ask for a new one. */
function OrganizationContractsPage() {
  const navigate = useNavigate()
  const [notice, setNotice] = useFlashNotice()
  const [creating, setCreating] = useState(false)
  const { data, error, loading, reload } = useFetch((signal) => organizationContractsApi.list(signal), 'organization-contracts')
  const items = data?.items ?? []

  return (
    <div className="page">
      <PageHeader
        title="Contracts"
        description="Ask for a contract, follow it while the admin reviews it, and see its terms once it is approved."
        actions={
          <Button onClick={() => setCreating(true)} disabled={data ? !data.canCreate : false}>
            <Icon name="plus" size={18} /> Ask for a contract
          </Button>
        }
      />
      <Notice message={notice} onClose={() => setNotice('')} />

      {data && !data.canCreate && (
        <Alert type="info">
          Your organization is <strong>{data.organizationStatus}</strong>. You can ask for a contract as soon as the admin has approved your organization.
        </Alert>
      )}

      <section className="card">
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading your contracts..." />
        ) : items.length === 0 ? (
          <EmptyState icon="file" title="No contracts yet" text="Ask for your first contract: choose how many employees you need and how you are billed." />
        ) : (
          <div className="table-wrap" aria-busy={loading}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Billing</th>
                  <th className="num">Employees</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Asked on</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>
                {items.map((contract) => (
                  <tr key={contract.contractId}>
                    <td>
                      <Link to={`/organization/contracts/${contract.contractId}`}>
                        <strong>{contract.contractNumber}</strong>
                      </Link>
                    </td>
                    <td>{contract.billingCycle || <span className="cell-muted">—</span>}</td>
                    <td className="num">
                      {contract.minEmployees ?? '—'} – {contract.maxEmployees ?? '—'}
                    </td>
                    <td className="cell-muted">
                      {contract.startDate ? formatDate(contract.startDate) : '—'} – {contract.endDate ? formatDate(contract.endDate) : '—'}
                    </td>
                    <td>
                      <WorkflowBadge status={contract.status} />
                    </td>
                    <td className="cell-muted">{contract.createdAt ? formatDate(contract.createdAt) : '—'}</td>
                    <td>
                      <ViewButton to={`/organization/contracts/${contract.contractId}`} label={`View ${contract.contractNumber}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating && (
        <OrganizationContractFormModal
          onClose={() => setCreating(false)}
          onSaved={(message, result) => {
            setCreating(false)
            setNotice(message)
            reload()
            if (result?.contractId) navigate(`/organization/contracts/${result.contractId}`, { state: { message } })
          }}
        />
      )}
    </div>
  )
}

export default OrganizationContractsPage
