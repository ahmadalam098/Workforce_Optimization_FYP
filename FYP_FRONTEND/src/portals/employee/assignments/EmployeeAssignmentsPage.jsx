import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import DecisionModal from '../../admin/shared/DecisionModal.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { employeeOffersApi } from '../../../services/employee/employeeService.js'
import { formatDateTime, formatTimeAgo } from '../../../utils/format.js'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'

const TONES = { Pending: 'warning', Accepted: 'success', Declined: 'neutral', Cancelled: 'neutral', Expired: 'neutral', Failed: 'danger' }

/** Employee: the assignments your organization manager offers you. Accept to start working for the organization (it then sees you online); decline if you cannot. */
function EmployeeAssignmentsPage() {
  const [notice, setNotice] = useFlashNotice()
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(null)
  const [declining, setDeclining] = useState(null)
  const { data, error, loading, reload } = useFetch((signal) => employeeOffersApi.list(signal), 'employee-offers')
  const offers = data ?? []

  async function accept(offer) {
    setBusy(offer.offerId)
    setProblem('')
    try {
      const result = await employeeOffersApi.accept(offer.offerId)
      setNotice(result?.message || 'Accepted.')
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy(null)
      reload()
    }
  }

  return (
    <div className="page">
      <PageHeader title="My Assignments" description="Work offered to you by your organization manager. Accepting puts you on the organization's team; it can then see you online and call you." />
      <Notice message={notice} onClose={() => setNotice('')} />
      {problem && (
        <Alert type="error" onClose={() => setProblem('')}>
          {problem}
        </Alert>
      )}

      <section className="card">
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading..." />
        ) : offers.length === 0 ? (
          <EmptyState icon="building" title="No assignments yet" text="When your manager offers you work for an organization, it appears here." />
        ) : (
          <ul className="plain-list card__body">
            {offers.map((offer) => (
              <li key={offer.offerId} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border, #e3dccd)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem 1rem' }}>
                  <strong>{offer.orgName}</strong>
                  <Badge tone={TONES[offer.status] ?? 'neutral'}>{offer.status}</Badge>
                  <span className="cell-muted">{offer.kind === 'Minimum' ? 'Regular team member' : 'Extra staff request'} · offered {formatTimeAgo(offer.createdAt)}</span>
                </div>
                {offer.requestReason && <p style={{ margin: '0.25rem 0 0' }}>{offer.requestReason}</p>}
                {offer.startsAt && (
                  <p className="cell-muted" style={{ margin: 0 }}>
                    Needed {formatDateTime(offer.startsAt)} – {formatDateTime(offer.endsAt)}
                  </p>
                )}
                {offer.note && <p className="cell-muted" style={{ margin: 0 }}>{offer.note}</p>}
                {offer.status === 'Pending' && (
                  <div className="row-actions" style={{ marginTop: '0.5rem' }}>
                    <Button onClick={() => accept(offer)} loading={busy === offer.offerId}>
                      Accept
                    </Button>
                    <Button variant="secondary" onClick={() => setDeclining(offer)}>
                      Decline
                    </Button>
                    <span className="cell-muted">Expires {formatDateTime(offer.expiresAt)}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {declining && (
        <DecisionModal
          title="Decline this assignment?"
          description={`Your manager is told. You will not work for ${declining.orgName} because of this offer.`}
          label="Reason"
          confirmLabel="Decline"
          onSubmit={async (note) => {
            const result = await employeeOffersApi.decline(declining.offerId, note || undefined)
            setDeclining(null)
            setNotice(result?.message || 'Declined.')
            reload()
          }}
          onClose={() => setDeclining(null)}
        />
      )}
    </div>
  )
}

export default EmployeeAssignmentsPage
