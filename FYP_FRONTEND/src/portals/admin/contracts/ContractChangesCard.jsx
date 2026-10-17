import { useState } from 'react'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import ContractChangeTable from '../../../components/contracts/ContractChangeTable.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { contractChangesApi } from '../../../services/admin/adminService.js'
import { formatDate, formatDateTime } from '../../../utils/format.js'
import DecisionModal from '../shared/DecisionModal.jsx'
import { ErrorState } from '../shared/StateBox.jsx'

const OUTCOMES = {
  Approved: { tone: 'success', label: 'Approved' },
  Rejected: { tone: 'danger', label: 'Rejected' },
  Withdrawn: { tone: 'neutral', label: 'Withdrawn' },
}

/**
 * The changes the organization asked for in this approved contract. A change that is waiting shows what is now against what is asked, the
 * organization's reason, and the day it should start, with Approve (a new contract version is put in force and everything follows it) and
 * Reject (the reason is sent to the organization and the current contract keeps running).
 */
function ContractChangesCard({ contractId, onDone }) {
  const { data, error, loading, reload } = useFetch((signal) => contractChangesApi.list({ contractId, status: 'all' }, signal), `contract-changes-${contractId}`)
  const [deciding, setDeciding] = useState(null) // { change, action: 'approve' | 'reject' }

  const items = data ?? []
  const waiting = items.filter((item) => item.status === 'Pending')
  const decided = items.filter((item) => item.status !== 'Pending')
  if (!data && !loading && !error) return null
  if (data && items.length === 0) return null

  return (
    <section className="card" style={{ gridColumn: '1 / -1' }}>
      <div className="card__header">
        <h3 className="card__title">Changes asked by the organization</h3>
      </div>
      <div className="card__body form-stack">
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading..." />
        ) : (
          <>
            {waiting.map((change) => (
              <div key={change.modificationId} className="form-stack" style={{ border: '1px solid var(--gold-500)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', alignItems: 'center' }}>
                  <Badge tone="warning">Waiting for your decision</Badge>
                  <span className="cell-muted">Asked {formatDateTime(change.createdAt)}</span>
                  <span>
                    Starts: <strong>{change.effectiveDate ? formatDate(change.effectiveDate) : 'as soon as you approve'}</strong>
                  </span>
                </div>
                <p style={{ margin: 0 }}>
                  <strong>Reason:</strong> {change.comment}
                </p>
                <ContractChangeTable changes={change.changes} />
                <p className="cell-muted" style={{ margin: 0 }}>The hourly rates are not part of a change: they are fixed. If you reject it, the current contract keeps running.</p>
                <div className="row-actions">
                  <Button onClick={() => setDeciding({ change, action: 'approve' })}>
                    <Icon name="checkCircle" size={17} /> Approve
                  </Button>
                  <Button variant="secondary" onClick={() => setDeciding({ change, action: 'reject' })}>
                    <Icon name="close" size={17} /> Reject
                  </Button>
                </div>
              </div>
            ))}

            {decided.length > 0 && (
              <div>
                <p className="term-group__title">Earlier changes</p>
                <ul className="plain-list">
                  {decided.map((change) => (
                    <li key={change.modificationId}>
                      <Badge tone={OUTCOMES[change.status]?.tone ?? 'neutral'}>{OUTCOMES[change.status]?.label ?? change.status}</Badge>{' '}
                      <span className="cell-muted">
                        {formatDate(change.createdAt)}
                        {change.scheduled && change.effectiveDate ? ` · starts ${formatDate(change.effectiveDate)}` : ''}
                      </span>
                      <p style={{ margin: '0.25rem 0 0' }}>{change.comment}</p>
                      {change.adminResponse && <p className="cell-muted" style={{ margin: 0 }}>Your reply: {change.adminResponse}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {deciding?.action === 'approve' && (
        <DecisionModal
          title="Approve this change?"
          description={`${deciding.change.effectiveDate ? `It starts on ${formatDate(deciding.change.effectiveDate)}; until then the current contract keeps running.` : 'It starts now.'} The new terms are then used everywhere: allocation limits, billing and daily staffing.`}
          label="Note for the organization (optional)"
          confirmLabel="Approve"
          onSubmit={async (note) => {
            const result = await contractChangesApi.approve(deciding.change.modificationId, note || undefined)
            setDeciding(null)
            reload()
            onDone?.(result?.message || 'Change approved.')
          }}
          onClose={() => setDeciding(null)}
        />
      )}
      {deciding?.action === 'reject' && (
        <DecisionModal
          title="Reject this change?"
          description="The current contract keeps running unchanged. The organization sees your reason."
          label="Why is it not approved?"
          required
          danger
          confirmLabel="Reject"
          onSubmit={async (note) => {
            const result = await contractChangesApi.reject(deciding.change.modificationId, note)
            setDeciding(null)
            reload()
            onDone?.(result?.message || 'Change rejected.')
          }}
          onClose={() => setDeciding(null)}
        />
      )}
    </section>
  )
}

export default ContractChangesCard
