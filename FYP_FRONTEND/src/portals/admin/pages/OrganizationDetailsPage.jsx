import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { organizationsApi } from '../../../services/adminService.js'
import { formatDate, formatDateTime, getInitials } from '../../../utils/format.js'
import { formatPeriod, formatStaffRange } from '../../../utils/contractFormat.js'
import { ActiveBadge } from '../components/StatusBadge.jsx'
import { emailSentence } from '../../../utils/emailNote.js'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import DecisionModal from '../components/DecisionModal.jsx'
import Notice from '../components/Notice.jsx'
import OrganizationFormModal from '../components/OrganizationFormModal.jsx'
import { EmptyState, ErrorState } from '../components/StateBox.jsx'
import WorkflowBadge from '../components/WorkflowBadge.jsx'

function InfoItem({ label, children }) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd>{children || <span className="cell-muted">—</span>}</dd>
    </div>
  )
}

const isActive = (status) => status === 'Active' || status === 'Approved'

function OrganizationDetailsPage() {
  const { organizationId } = useParams()
  const [editing, setEditing] = useState(false)
  const [decision, setDecision] = useState(null) // 'approve' | 'reject' | 'suspend'
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()
  const [notice, setNotice] = useState('')

  const { data: org, error, loading, reload } = useFetch(
    (signal) => organizationsApi.get(organizationId, signal),
    `organization-${organizationId}`,
  )

  const back = (
    <Link className="back-link" to="/admin/organizations">
      <Icon name="arrowLeft" size={16} /> Back to Organizations
    </Link>
  )

  if (!org && loading) {
    return (
      <div className="page">
        {back}
        <Spinner label="Loading organization..." />
      </div>
    )
  }

  if (!org) {
    return (
      <div className="page">
        {back}
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      </div>
    )
  }

  const DECISIONS = {
    approve: {
      title: 'Approve organization?',
      description: `${org.name} will become active and can receive contracts.`,
      label: 'Note',
      confirm: 'Approve',
      required: false,
      run: (reason) => organizationsApi.approve(org.organizationId, reason),
      done: `${org.name} was approved.`,
    },
    reject: {
      title: 'Reject organization?',
      description: 'The organization will be marked as rejected. The reason is saved in its history.',
      label: 'Reason',
      confirm: 'Reject',
      required: true,
      danger: true,
      run: (reason) => organizationsApi.reject(org.organizationId, reason),
      done: `${org.name} was rejected.`,
    },
    suspend: {
      title: 'Suspend organization?',
      description: 'A suspended organization is paused. You can approve it again later.',
      label: 'Reason',
      confirm: 'Suspend',
      required: true,
      danger: true,
      run: (reason) => organizationsApi.suspend(org.organizationId, reason),
      done: `${org.name} was suspended.`,
    },
  }
  const activeDecision = decision ? DECISIONS[decision] : null

  async function runDecision(reason) {
    const result = await activeDecision.run(reason)
    setNotice(`${activeDecision.done}${emailSentence(result)}`)
    setDecision(null)
    reload()
  }

  async function handleDelete() {
    const result = await organizationsApi.remove(org.organizationId)
    navigate('/admin/organizations', { replace: true, state: { message: result?.message || `${org.name} was deleted.` } })
  }

  return (
    <div className="page">
      {back}
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card hero-card">
        <span className="avatar avatar--lg" aria-hidden="true">
          {getInitials(org.name)}
        </span>
        <div className="hero-card__main">
          <h2 className="hero-card__title">{org.name}</h2>
          <p className="hero-card__sub">{[org.email, org.country].filter(Boolean).join(' · ')}</p>
          <div className="hero-card__badges">
            <WorkflowBadge status={org.status} />
          </div>
        </div>
        <div className="hero-card__actions">
          {(org.status === 'Pending' || org.status === 'Rejected' || org.status === 'Suspended') && (
            <Button onClick={() => setDecision('approve')}>
              <Icon name="checkCircle" size={17} /> Approve
            </Button>
          )}
          {org.status === 'Pending' && (
            <Button variant="secondary" onClick={() => setDecision('reject')}>
              <Icon name="close" size={17} /> Reject
            </Button>
          )}
          {isActive(org.status) && (
            <>
              <Button onClick={() => navigate(`/admin/contracts/new?organizationId=${org.organizationId}`)}>
                <Icon name="plus" size={17} /> New contract
              </Button>
              <Button variant="secondary" onClick={() => setDecision('suspend')}>
                <Icon name="ban" size={17} /> Suspend
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Icon name="edit" size={17} /> Edit
          </Button>
          <Button variant="secondary" onClick={() => setDeleting(true)}>
            <Icon name="trash" size={17} /> Delete
          </Button>
        </div>
      </section>

      <div className="details-grid">
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Overview</h3>
          </div>
          <dl className="card__body info-list">
            <InfoItem label="Phone">{org.phone}</InfoItem>
            <InfoItem label="Country">{org.country}</InfoItem>
            <InfoItem label="Address">{org.address}</InfoItem>
            <InfoItem label="Registered">{org.createdAt ? formatDate(org.createdAt) : null}</InfoItem>
            <InfoItem label="Approved">{org.approvedAt ? formatDate(org.approvedAt) : null}</InfoItem>
            <InfoItem label="Employees">
              {org.employeeCount} ({org.availableEmployeeCount} available)
            </InfoItem>
          </dl>
        </section>

        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Managers</h3>
          </div>
          <div className="card__body">
            {org.managers.length === 0 ? (
              <p className="cell-muted">No manager is assigned yet. Assign one from Team → Organization Managers.</p>
            ) : (
              <ul className="skill-list">
                {org.managers.map((manager) => (
                  <li key={manager.userId}>
                    <span>
                      <strong>{manager.fullName}</strong>
                      <span className="cell-muted"> · {manager.email}</span>
                    </span>
                    <ActiveBadge isActive={manager.isActive} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Contracts</h3>
        </div>
        {org.contracts.length === 0 ? (
          <EmptyState icon="file" title="No contracts yet" text={isActive(org.status) ? 'Create the first contract for this organization.' : 'Approve the organization before creating a contract.'} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Period</th>
                  <th>Employees (min – max)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {org.contracts.map((contract) => (
                  <tr key={contract.contractId}>
                    <td>
                      <Link className="person__name" to={`/admin/contracts/${contract.contractId}`}>
                        {contract.contractNumber || `#${contract.contractId}`}
                      </Link>
                    </td>
                    <td className="cell-muted">{formatPeriod(contract.startDate, contract.endDate)}</td>
                    <td>{formatStaffRange(contract.minEmployees, contract.maxEmployees)}</td>
                    <td>
                      <WorkflowBadge status={contract.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Decision history</h3>
        </div>
        {org.decisions.length === 0 ? (
          <EmptyState icon="clock" title="No decisions yet" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Decision</th>
                  <th>Reason</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {org.decisions.map((item, index) => (
                  <tr key={`${item.decidedAt}-${index}`}>
                    <td>{formatDateTime(item.decidedAt)}</td>
                    <td>
                      <WorkflowBadge status={item.decision} />
                    </td>
                    <td className="cell-muted">{item.reason || '—'}</td>
                    <td className="cell-muted">{item.decidedBy || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <OrganizationFormModal
          organization={org}
          onClose={() => setEditing(false)}
          onSaved={(message) => {
            setEditing(false)
            setNotice(message)
            reload()
          }}
        />
      )}


      {deleting && (
        <ConfirmDialog
          title="Delete organization?"
          message={`${org.name} will be removed for good, together with its manager links and any contract that was never approved. This cannot be undone. Organizations that already have employees, approved contracts, invoices, allocations or tickets cannot be deleted; suspend them instead.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleting(false)}
        />
      )}

      {activeDecision && (
        <DecisionModal
          title={activeDecision.title}
          description={activeDecision.description}
          label={activeDecision.label}
          required={activeDecision.required}
          confirmLabel={activeDecision.confirm}
          danger={activeDecision.danger}
          onSubmit={runDecision}
          onClose={() => setDecision(null)}
        />
      )}
    </div>
  )
}

export default OrganizationDetailsPage
