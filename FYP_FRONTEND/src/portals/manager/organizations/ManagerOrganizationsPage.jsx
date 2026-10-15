import { Link } from 'react-router-dom'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { managerInfoApi } from '../../../services/manager/managerService.js'
import { formatDate } from '../../../utils/format.js'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import ViewButton from '../../admin/shared/ViewButton.jsx'
import WorkflowBadge from '../../admin/shared/WorkflowBadge.jsx'

/** Organization Manager: the organizations assigned to me, with their contract and how many employees work there. */
function ManagerOrganizationsPage() {
  const { data, error, loading, reload } = useFetch((signal) => managerInfoApi.organizations(signal), 'manager-organizations')

  return (
    <div className="page">
      <PageHeader title="My Organizations" description="The organizations the administrator assigned to you. Open one to see its details, contract, managers and employees." />

      <section className="card">
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading your organizations..." />
        ) : data.length === 0 ? (
          <EmptyState icon="building" title="No organizations yet" text="The administrator has not assigned any organization to you yet." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Status</th>
                  <th>Contract</th>
                  <th className="num">Employees</th>
                  <th className="num">Open queries</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>
                {data.map((org) => (
                  <tr key={org.organizationId}>
                    <td>
                      <Link to={`/manager/organizations/${org.organizationId}`}>
                        <strong>{org.name}</strong>
                      </Link>
                      <span className="person__sub">{org.email || '—'}</span>
                    </td>
                    <td>
                      <WorkflowBadge status={org.status} />
                    </td>
                    <td>
                      {org.contract ? (
                        <>
                          {org.contract.contractNumber}
                          <span className="person__sub">{org.contract.endDate ? `until ${formatDate(org.contract.endDate)}` : 'no end date'}</span>
                        </>
                      ) : (
                        <span className="cell-muted">No active contract</span>
                      )}
                    </td>
                    <td className="num">
                      {org.employeesWorking}
                      {org.contract?.maxEmployees != null && <span className="person__sub">of {org.contract.maxEmployees} allowed</span>}
                    </td>
                    <td className="num">{org.openTickets}</td>
                    <td>
                      <ViewButton to={`/manager/organizations/${org.organizationId}`} label={`View ${org.name}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default ManagerOrganizationsPage
