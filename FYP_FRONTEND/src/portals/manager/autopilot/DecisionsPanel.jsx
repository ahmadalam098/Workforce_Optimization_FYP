import { Fragment, useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { managerAutopilotApi } from '../../../services/manager/managerService.js'
import { formatDateTime } from '../../../utils/format.js'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'

const PAGE_SIZE = 10
const STATUS_TONE = { Suggested: 'warning', Offered: 'info', Applied: 'success', Rejected: 'neutral', Undone: 'neutral', Failed: 'danger', Declined: 'neutral', Expired: 'neutral' }
const STATUS_TEXT = { Suggested: 'Waiting for you', Offered: 'Waiting for the employee', Declined: 'Employee declined', Expired: 'No answer in time' }
const KIND_TEXT = { Minimum: 'Contract minimum', Request: 'Staff request', Substitute: 'Replacement' }
const PART_TEXT = { skill: 'Skill', rating: 'Rating', ownership: 'Own staff', returning: 'Worked here', idle: 'Idle' }
const STATUS_OPTIONS = [
  { value: '', label: 'All decisions' },
  { value: 'Suggested', label: 'Waiting for you' },
  { value: 'Offered', label: 'Waiting for the employee' },
  { value: 'Applied', label: 'Applied' },
  { value: 'Declined', label: 'Declined by the employee' },
  { value: 'Expired', label: 'Offer expired' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'Undone', label: 'Undone' },
  { value: 'Failed', label: 'Could not be placed' },
]

/** The "Why?" of one decision: the reason in words, the parts of the score and the next best choices. */
function Why({ decision }) {
  const parts = decision.breakdown ? Object.entries(decision.breakdown) : []
  const alternatives = Array.isArray(decision.alternatives) ? decision.alternatives : []
  return (
    <div className="ap-why">
      <p className="ap-why__reason">
        <strong>Why {decision.employeeName}?</strong> {decision.reason}.
      </p>
      {parts.length > 0 && (
        <div className="ap-bars" aria-label="Parts of the score">
          {parts.map(([key, value]) => (
            <div className="ap-bar" key={key}>
              <span>{PART_TEXT[key] ?? key}</span>
              <span className="ap-bar__track">
                <span className="ap-bar__fill" style={{ display: 'block', width: `${Math.max(0, Math.min(100, value))}%` }} />
              </span>
              <span>{Math.round(value)}</span>
            </div>
          ))}
        </div>
      )}
      {alternatives.length > 0 && (
        <p className="cell-muted">
          Next best: {alternatives.map((alt) => `${alt.name} (${Math.round(alt.score)})`).join(', ')}
        </p>
      )}
      <p className="cell-muted">
        Decided by the {decision.planner === 'AI service' ? 'AI service' : 'built-in planner'} · {decision.triggerBy === 'Manager' ? 'you asked for it' : 'autopilot'}
        {decision.note ? ` · ${decision.note}` : ''}
      </p>
    </div>
  )
}

/** Every choice of the AI with its reason. The manager applies or rejects suggestions and can undo what was applied. */
function DecisionsPanel({ orgs, refreshKey, onChanged, onNotice }) {
  const [orgId, setOrgId] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState('')
  const [problem, setProblem] = useState('')
  const [undoing, setUndoing] = useState(null)
  const params = { orgId: orgId || undefined, status: status || undefined, page, pageSize: PAGE_SIZE }
  const { data, error, loading, reload } = useFetch((signal) => managerAutopilotApi.decisions(params, signal), `${JSON.stringify(params)}-${refreshKey}`)
  const items = data?.items ?? []

  async function act(decision, key, call) {
    setBusy(`${key}-${decision.decisionId}`)
    setProblem('')
    try {
      const result = await call()
      onNotice(result?.message || 'Done.')
      onChanged()
      reload()
    } catch (err) {
      setProblem(err.message)
      reload()
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="card">
      <div className="card__header">
        <h3 className="card__title">AI decisions</h3>
      </div>
      <div className="toolbar">
        <SelectField
          className="toolbar__filter"
          label="Organization"
          value={orgId}
          onChange={(event) => { setOrgId(event.target.value); setPage(1) }}
          options={[{ value: '', label: 'All my organizations' }, ...orgs.map((org) => ({ value: String(org.orgId), label: org.orgName }))]}
        />
        <SelectField className="toolbar__filter" label="Show" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} options={STATUS_OPTIONS} />
      </div>
      {problem && (
        <div className="card__body">
          <Alert type="error" onClose={() => setProblem('')}>
            {problem}
          </Alert>
        </div>
      )}
      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data && loading ? (
        <Spinner label="Loading the decisions..." />
      ) : items.length === 0 ? (
        <EmptyState icon="sparkles" title="No AI decisions yet" text="Turn the autopilot on, or press “Suggest only” on an organization, and every choice appears here with its reason." />
      ) : (
        <>
          <div className="table-wrap" aria-busy={loading}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>For</th>
                  <th className="num">Score</th>
                  <th>Status</th>
                  <th>When</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((decision) => (
                  <Fragment key={decision.decisionId}>
                    <tr>
                      <td>
                        <strong>{decision.employeeName}</strong>
                        {decision.isLoan && <span className="person__sub">borrowed from {decision.fromOrgName}</span>}
                      </td>
                      <td>
                        {decision.orgName}
                        <span className="person__sub">{KIND_TEXT[decision.kind] ?? decision.kind}</span>
                      </td>
                      <td className="num">
                        <span className="ap-score">{Math.round(decision.score)}</span>
                      </td>
                      <td>
                        <Badge tone={STATUS_TONE[decision.status] ?? 'neutral'} dot>
                          {STATUS_TEXT[decision.status] ?? decision.status}
                        </Badge>
                        {['Failed', 'Declined', 'Expired'].includes(decision.status) && decision.note && <span className="person__sub">{decision.note}</span>}
                      </td>
                      <td className="cell-muted cell-date">{formatDateTime(decision.createdAt)}</td>
                      <td>
                        <div className="row-actions">
                          <Button variant="secondary" onClick={() => setOpen(open === decision.decisionId ? null : decision.decisionId)}>
                            {open === decision.decisionId ? 'Hide' : 'Why?'}
                          </Button>
                          {decision.canApply && (
                            <>
                              <Button loading={busy === `apply-${decision.decisionId}`} onClick={() => act(decision, 'apply', () => managerAutopilotApi.apply(decision.decisionId))}>
                                Apply
                              </Button>
                              <Button variant="secondary" loading={busy === `reject-${decision.decisionId}`} onClick={() => act(decision, 'reject', () => managerAutopilotApi.reject(decision.decisionId))}>
                                Reject
                              </Button>
                            </>
                          )}
                          {decision.canUndo && (
                            <Button variant="secondary" onClick={() => setUndoing(decision)}>
                              {decision.status === 'Offered' ? 'Cancel offer' : 'Undo'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {open === decision.decisionId && (
                      <tr>
                        <td colSpan={6} style={{ padding: 0 }}>
                          <Why decision={decision} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        </>
      )}

      {undoing && (
        <ConfirmDialog
          title={undoing.status === 'Offered' ? 'Cancel this offer?' : 'Undo this AI decision?'}
          message={undoing.status === 'Offered' ? `The offer to ${undoing.employeeName} is withdrawn.` : `${undoing.employeeName} is released from ${undoing.orgName} and is free again. The AI will not place them again for an hour.`}
          confirmLabel={undoing.status === 'Offered' ? 'Cancel offer' : 'Undo'}
          danger
          onCancel={() => setUndoing(null)}
          onConfirm={async () => {
            const result = await managerAutopilotApi.undo(undoing.decisionId)
            setUndoing(null)
            onNotice(result?.message || 'Undone.')
            onChanged()
            reload()
          }}
        />
      )}
    </section>
  )
}

export default DecisionsPanel
