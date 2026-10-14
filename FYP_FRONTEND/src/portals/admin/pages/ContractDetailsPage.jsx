import { useState } from 'react'
import { emailSentence } from '../../../utils/emailNote.js'
import { Link, useLocation, useParams, useNavigate } from 'react-router-dom'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { TERM_GROUPS } from '../../../constants/contracts.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { contractsApi, organizationsApi } from '../../../services/adminService.js'
import { formatDate, formatDateTime } from '../../../utils/format.js'
import { formatTerm } from '../../../utils/contractFormat.js'
import ContractFormModal from '../components/ContractFormModal.jsx'
import DecisionModal from '../components/DecisionModal.jsx'
import Notice from '../components/Notice.jsx'
import RuleFormModal from '../components/RuleFormModal.jsx'
import { EmptyState, ErrorState } from '../components/StateBox.jsx'
import WorkflowBadge from '../components/WorkflowBadge.jsx'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'rules', label: 'Rules' },
  { id: 'versions', label: 'Versions' },
]

const isActive = (status) => status === 'Active' || status === 'Approved'

function InfoItem({ label, children }) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function ContractDetailsPage() {
  const { contractId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [tab, setTab] = useState(location.state?.tab === 'rules' ? 'rules' : 'overview')
  const [notice, setNotice] = useState(location.state?.message ?? '')
  const [editing, setEditing] = useState(false)
  const [decision, setDecision] = useState(null) // 'approve' | 'reject' | 'terminate'
  const [ruleTarget, setRuleTarget] = useState(null) // null | 'new' | rule
  const [ruleToDelete, setRuleToDelete] = useState(null)

  const { data: contract, error, loading, reload } = useFetch(
    (signal) => contractsApi.get(contractId, signal),
    `contract-${contractId}`,
  )
  const { data: organizations } = useFetch((signal) => organizationsApi.lookup(signal), 'organizations')

  const back = (
    <Link className="back-link" to="/admin/contracts">
      <Icon name="arrowLeft" size={16} /> Back to Contracts
    </Link>
  )

  if (!contract && loading) {
    return (
      <div className="page">
        {back}
        <Spinner label="Loading contract..." />
      </div>
    )
  }

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

  const DECISIONS = {
    approve: {
      title: 'Approve contract?',
      description: 'The contract becomes active and can be used for workforce requests and allocation.',
      label: 'Note',
      confirm: 'Approve',
      required: false,
      run: (reason) => contractsApi.approve(contract.contractId, reason),
      done: 'Contract approved and now active.',
    },
    reject: {
      title: 'Reject contract?',
      description: 'The reason is saved in the decision history.',
      label: 'Reason',
      confirm: 'Reject',
      required: true,
      danger: true,
      run: (reason) => contractsApi.reject(contract.contractId, reason),
      done: 'Contract rejected.',
    },
    terminate: {
      title: 'Terminate contract?',
      description: 'An active contract will be ended. This cannot be undone.',
      label: 'Reason',
      confirm: 'Terminate',
      required: true,
      danger: true,
      run: (reason) => contractsApi.terminate(contract.contractId, reason),
      done: 'Contract terminated.',
    },
  }
  const activeDecision = decision ? DECISIONS[decision] : null

  async function runDecision(reason) {
    const result = await activeDecision.run(reason)
    setNotice(`${activeDecision.done}${emailSentence(result)}`)
    setDecision(null)
    reload()
  }

  async function handleDeleteRule() {
    await contractsApi.deleteRule(contract.contractId, ruleToDelete.ruleId)
    setNotice('Rule deleted.')
    setRuleToDelete(null)
    reload()
  }

  function saved(close, message) {
    close()
    setNotice(message)
    reload()
  }

  return (
    <div className="page">
      {back}
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card hero-card">
        <div className="hero-card__main">
          <h2 className="hero-card__title">{contract.contractNumber || `Contract #${contract.contractId}`}</h2>
          <p className="hero-card__sub">
            {contract.organizationId ? <Link to={`/admin/organizations/${contract.organizationId}`}>{contract.organizationName}</Link> : '—'}
            {contract.createdAt ? ` · created ${formatDate(contract.createdAt)}` : ''}
          </p>
          <div className="hero-card__badges">
            <WorkflowBadge status={contract.status} />
            <Badge tone="gold">Version {contract.versionNo}</Badge>
          </div>
        </div>
        <div className="hero-card__actions">
          {contract.status === 'Pending' && (
            <>
              <Button onClick={() => setDecision('approve')}>
                <Icon name="checkCircle" size={17} /> Approve
              </Button>
              <Button variant="secondary" onClick={() => setDecision('reject')}>
                <Icon name="close" size={17} /> Reject
              </Button>
            </>
          )}
          {(contract.status === 'Pending' || isActive(contract.status) || contract.status === 'Suspended') && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Icon name="edit" size={17} /> Edit
            </Button>
          )}
          {isActive(contract.status) && (
            <>
              <Button variant="secondary" onClick={() => setDecision('terminate')}>
                <Icon name="ban" size={17} /> Terminate
              </Button>
            </>
          )}
        </div>
      </section>

      <div className="tabs" role="tablist" aria-label="Contract sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`tabs__tab ${tab === item.id ? 'is-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="details-grid">
          <section className="card">
            <div className="card__header">
              <h3 className="card__title">Terms</h3>
            </div>
            <div className="card__body">
              {TERM_GROUPS.slice(0, 3).map((group) => (
                <div className="term-group" key={group.title}>
                  <p className="term-group__title">{group.title}</p>
                  <dl className="info-list">
                    {group.fields.map((field) => (
                      <InfoItem key={field.key} label={field.label}>
                        {formatTerm(field.key, contract.terms[field.key])}
                      </InfoItem>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </section>
          <section className="card">
            <div className="card__header">
              <h3 className="card__title">Payment &amp; period</h3>
            </div>
            <div className="card__body">
              {TERM_GROUPS.slice(3).map((group) => (
                <div className="term-group" key={group.title}>
                  <p className="term-group__title">{group.title}</p>
                  <dl className="info-list">
                    {group.fields.map((field) => (
                      <InfoItem key={field.key} label={field.label}>
                        {formatTerm(field.key, contract.terms[field.key])}
                      </InfoItem>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </section>

          <section className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card__header">
              <h3 className="card__title">Decision history</h3>
            </div>
            {contract.decisions.length === 0 ? (
              <EmptyState icon="clock" title="No decisions yet" text="Approval, rejection and termination decisions appear here." />
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
                    {contract.decisions.map((item, index) => (
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
        </div>
      )}

      {tab === 'rules' && (
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Contract rules</h3>
            <Button onClick={() => navigate(`/admin/contracts/${contractId}/rules/new`)}>
              <Icon name="plus" size={17} /> Add rule
            </Button>
          </div>
          {contract.rules.length === 0 ? (
            <EmptyState icon="file" title="No rules yet" text="Add staffing, borrowing, payment or operational rules the allocation engine must respect." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Rule</th>
                    <th>Value</th>
                    <th>Status</th>
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {contract.rules.map((rule) => (
                    <tr key={rule.ruleId} className={rule.isActive ? '' : 'is-inactive'}>
                      <td>
                        <Badge tone="gold">{rule.category}</Badge>
                      </td>
                      <td>
                        <span className="person__name">{rule.title}</span>
                        {rule.description && <span className="person__sub">{rule.description}</span>}
                      </td>
                      <td>{rule.ruleValue || <span className="cell-muted">—</span>}</td>
                      <td>
                        <Badge tone={rule.isActive ? 'success' : 'neutral'}>{rule.isActive ? 'Active' : 'Disabled'}</Badge>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="icon-btn" onClick={() => setRuleTarget(rule)} aria-label={`Edit rule ${rule.title}`} title="Edit">
                            <Icon name="edit" size={17} />
                          </button>
                          <button type="button" className="icon-btn icon-btn--danger" onClick={() => setRuleToDelete(rule)} aria-label={`Delete rule ${rule.title}`} title="Delete">
                            <Icon name="close" size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'versions' && (
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Version history</h3>
          </div>
          <div className="card__body">
            {contract.versions.map((version) => (
              <article className="version-item" key={version.versionNo}>
                <div className="version-item__head">
                  <strong>Version {version.versionNo}</strong>
                  <span className="version-item__meta">
                    {formatDateTime(version.createdAt)}
                    {version.createdBy ? ` · ${version.createdBy}` : ''}
                    {version.versionNo === contract.versionNo ? ' · current' : ''}
                  </span>
                </div>
                {version.changeSummary && <p className="cell-muted">{version.changeSummary}</p>}
                <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                  {formatTerm('minEmployees', version.minEmployees)} – {formatTerm('maxEmployees', version.maxEmployees)} employees ·{' '}
                  Base {formatTerm('baseHourlyRate', version.baseHourlyRate)} / Extra{' '}
                  {formatTerm('extraHourlyRate', version.extraHourlyRate)} {version.billingCurrency || ''}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {editing && (
        <ContractFormModal
          contract={contract}
          organizations={organizations ?? []}
          onClose={() => setEditing(false)}
          onSaved={(message) => saved(() => setEditing(false), message)}
        />
      )}

      {ruleTarget && (
        <RuleFormModal
          contractId={contract.contractId}
          rule={ruleTarget === 'new' ? null : ruleTarget}
          onClose={() => setRuleTarget(null)}
          onSaved={(message) => saved(() => setRuleTarget(null), message)}
        />
      )}

      {ruleToDelete && (
        <ConfirmDialog
          title="Delete rule?"
          message={`"${ruleToDelete.title}" will be removed from this contract.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDeleteRule}
          onCancel={() => setRuleToDelete(null)}
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

export default ContractDetailsPage
