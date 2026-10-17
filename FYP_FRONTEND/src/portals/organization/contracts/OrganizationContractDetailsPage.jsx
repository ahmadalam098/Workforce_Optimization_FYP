import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { TERM_GROUPS } from '../../../constants/contracts.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { organizationContractsApi } from '../../../services/organization/organizationService.js'
import { formatTerm } from '../../../utils/contractFormat.js'
import { formatDate, formatDateTime } from '../../../utils/format.js'
import Notice from '../../admin/shared/Notice.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import WorkflowBadge from '../../admin/shared/WorkflowBadge.jsx'
import ContractChangeTable from '../../../components/contracts/ContractChangeTable.jsx'
import OrganizationContractChangeModal from './OrganizationContractChangeModal.jsx'
import OrganizationContractFormModal from './OrganizationContractFormModal.jsx'

const DAILY_STATES = {
  Complete: { tone: 'success', label: 'Minimum complete' },
  Short: { tone: 'danger', label: 'Employees missing' },
  Waiting: { tone: 'warning', label: "Today's window has not started" },
  WindowEnded: { tone: 'neutral', label: "Today's window is over" },
  NotStarted: { tone: 'neutral', label: 'Contract not started' },
  Finished: { tone: 'neutral', label: 'Contract ended' },
  OrganizationInactive: { tone: 'warning', label: 'Organization not active' },
  NoWindow: { tone: 'warning', label: 'No daily time set' },
}

// What the admin sets while reviewing.
const ADMIN_FIELDS = ['baseHourlyRate', 'extraHourlyRate', 'priorityLevel']

function InfoItem({ label, children }) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Organization: one of its contracts - the terms, the admin's decision, and (for a daily contract) how the daily staffing stands today. */
function OrganizationContractDetailsPage() {
  const { contractId } = useParams()
  const [notice, setNotice] = useFlashNotice()
  const [editing, setEditing] = useState(false)
  const [changing, setChanging] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [problem, setProblem] = useState('')
  const { data: contract, error, loading, reload } = useFetch((signal) => organizationContractsApi.get(contractId, signal), `organization-contract-${contractId}`)

  const back = (
    <Link className="back-link" to="/organization/contracts">
      <Icon name="arrowLeft" size={16} /> Back to Contracts
    </Link>
  )

  if (!contract && loading) return <Spinner label="Loading the contract..." />
  if (!contract) {
    return (
      <div className="page">
        {back}
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      </div>
    )
  }

  async function withdraw(modificationId) {
    setWithdrawing(true)
    setProblem('')
    try {
      const result = await organizationContractsApi.withdrawChange(modificationId)
      setNotice(result?.message || 'Withdrawn.')
      reload()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setWithdrawing(false)
    }
  }

  const pendingChange = contract.pendingChange
  const history = contract.changeHistory ?? []
  const daily = contract.dailyStaffing
  const pending = contract.status === 'Pending'
  const termText = (field) => {
    const value = contract.terms[field.key]
    if (ADMIN_FIELDS.includes(field.key) && (value === null || value === undefined || value === '')) return <span className="cell-muted">Set by the admin</span>
    return formatTerm(field.key, value)
  }

  return (
    <div className="page">
      {back}
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card hero-card">
        <div className="hero-card__main">
          <h2 className="hero-card__title">{contract.contractNumber}</h2>
          <p className="hero-card__sub">Asked on {formatDate(contract.createdAt)}{contract.approvedAt ? ` · approved ${formatDate(contract.approvedAt)}` : ''}</p>
          <div className="hero-card__badges">
            <WorkflowBadge status={contract.status} />
            <Badge tone="gold">Version {contract.versionNo}</Badge>
          </div>
        </div>
        <div className="hero-card__actions">
          {contract.canEdit && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Icon name="edit" size={17} /> Change request
            </Button>
          )}
          {contract.canRequestChange && (
            <Button variant="secondary" onClick={() => setChanging(true)}>
              <Icon name="edit" size={17} /> Ask to change this contract
            </Button>
          )}
        </div>
      </section>

      {pending && <Alert type="info">The admin has not decided yet. The admin will set the hourly rates and then approve or reject your request. You can still change it until then.</Alert>}
      {contract.status === 'Rejected' && <Alert type="error">This request was rejected. See the reason below; you can ask for a new contract.</Alert>}

      {problem && <Alert type="error" onClose={() => setProblem('')}>{problem}</Alert>}

      {pendingChange && (
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Your change is waiting for the admin</h3>
          </div>
          <div className="card__body form-stack">
            <p style={{ margin: 0 }}>
              Your current contract keeps running until the admin decides. Asked on {formatDate(pendingChange.createdAt)}
              {pendingChange.effectiveDate ? `; it should start on ${formatDate(pendingChange.effectiveDate)}` : ''}.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Your reason:</strong> {pendingChange.comment}
            </p>
            <ContractChangeTable changes={pendingChange.changes} />
            <div>
              <Button variant="secondary" onClick={() => withdraw(pendingChange.modificationId)} loading={withdrawing}>
                Withdraw this request
              </Button>
            </div>
          </div>
        </section>
      )}

      <div className="details-grid">
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Terms</h3>
          </div>
          <div className="card__body">
            {TERM_GROUPS.map((group) => (
              <div className="term-group" key={group.title}>
                <p className="term-group__title">{group.title}</p>
                <dl className="info-list">
                  {group.fields.map((field) => (
                    <InfoItem key={field.key} label={field.label}>
                      {termText(field)}
                    </InfoItem>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>

        <div className="form-stack">
          <section className="card">
            <div className="card__header">
              <h3 className="card__title">The admin&apos;s decision</h3>
            </div>
            {contract.decisions.length === 0 ? (
              <div className="card__body">
                <EmptyState icon="clock" title="No decision yet" text="The admin's decision and reason will appear here." />
              </div>
            ) : (
              <ul className="card__body plain-list">
                {contract.decisions.map((decision) => (
                  <li key={`${decision.decision}-${decision.decidedAt}`}>
                    <strong>{decision.decision}</strong> <span className="cell-muted">· {formatDateTime(decision.decidedAt)}</span>
                    {decision.reason && <p style={{ margin: '0.25rem 0 0' }}>{decision.reason}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {history.length > 0 && (
            <section className="card">
              <div className="card__header">
                <h3 className="card__title">Your earlier change requests</h3>
              </div>
              <ul className="card__body plain-list">
                {history.map((change) => (
                  <li key={change.modificationId}>
                    <Badge tone={change.status === 'Approved' ? 'success' : change.status === 'Rejected' ? 'danger' : 'neutral'}>{change.status}</Badge>{' '}
                    <span className="cell-muted">
                      {formatDate(change.createdAt)}
                      {change.status === 'Approved' ? (change.scheduled ? ` · starts ${formatDate(change.effectiveDate)}` : ` · in force since ${formatDate(change.appliedAt)}`) : ''}
                    </span>
                    <p style={{ margin: '0.25rem 0 0' }}>{change.comment}</p>
                    <ContractChangeTable changes={change.changes} showCurrent={false} />
                    {change.adminResponse && <p className="cell-muted" style={{ margin: '0.25rem 0 0' }}>Admin: {change.adminResponse}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {daily && (
            <section className="card">
              <div className="card__header">
                <h3 className="card__title">Daily staffing today</h3>
              </div>
              <div className="card__body form-stack">
                <p>
                  Every day your manager appoints <strong>{daily.min}</strong> employee{daily.min === 1 ? '' : 's'} for <strong>{daily.window}</strong>. More can be added with a{' '}
                  <Link to="/organization/requests">staff request</Link>, up to {daily.max ?? 'the maximum'}.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem 1.25rem' }}>
                  <Badge tone={DAILY_STATES[daily.state]?.tone ?? 'neutral'}>{DAILY_STATES[daily.state]?.label ?? daily.state}</Badge>
                  <span>
                    Appointed today: <strong>{daily.appointed}</strong> of {daily.min}
                  </span>
                  <span>
                    Extra (staff requests): <strong>{daily.extra}</strong>
                  </span>
                </div>
                {daily.employees.length > 0 && (
                  <div className="chip-list">
                    {daily.employees.map((name) => (
                      <span className="chip" key={name}>
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {changing && (
        <OrganizationContractChangeModal
          contract={contract}
          onClose={() => setChanging(false)}
          onSaved={(message) => {
            setChanging(false)
            setNotice(message)
            reload()
          }}
        />
      )}

      {editing && (
        <OrganizationContractFormModal
          contract={contract}
          onClose={() => setEditing(false)}
          onSaved={(message) => {
            setEditing(false)
            setNotice(message)
            reload()
          }}
        />
      )}
    </div>
  )
}

export default OrganizationContractDetailsPage
