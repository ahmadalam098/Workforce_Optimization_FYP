import { useEffect, useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { managerAutopilotApi } from '../../../services/manager/managerService.js'
import { formatDateTime } from '../../../utils/format.js'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'

const parseUtc = (value) => new Date(value.endsWith('Z') ? value : `${value}Z`).getTime()

/** "02:41" left until the deadline. `offset` is how far this computer's clock is from the server's. */
function Countdown({ deadline, offset }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const left = Math.max(0, Math.floor((parseUtc(deadline) - (now + offset)) / 1000))
  return <span className="ap-countdown">{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</span>
}

/** Employees working for another organization. The owner can recall one: the borrower has a few minutes, then the employee goes back. */
function LoansPanel({ refreshKey, recallMinutes, onChanged, onNotice }) {
  const [busy, setBusy] = useState('')
  const [problem, setProblem] = useState('')
  const [recalling, setRecalling] = useState(null)
  const { data, error, loading, reload } = useFetch(async (signal) => {
    const result = await managerAutopilotApi.loans(signal)
    // How far this computer's clock is from the server's, so the countdown shows the server's time.
    return { ...result, offset: parseUtc(result.serverTime) - Date.now() }
  }, `autopilot-loans-${refreshKey}`)
  const items = data?.items ?? []

  async function returnNow(loan) {
    setBusy(`return-${loan.loanId}`)
    setProblem('')
    try {
      const result = await managerAutopilotApi.returnNow(loan.loanId)
      onNotice(result?.message || 'Done.')
      onChanged()
      reload()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="card">
      <div className="card__header">
        <h3 className="card__title">Loans and recalls</h3>
      </div>
      <div className="card__body">
        <p className="cell-muted">
          When your organization has no free employee, the AI can borrow a spare one from another organization. The owner may ask for the employee back: the borrower
          then has {recallMinutes} minutes, a replacement is suggested, and the employee goes back.
        </p>
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
        <Spinner label="Loading the loans..." />
      ) : items.length === 0 ? (
        <EmptyState icon="swap" title="No loans yet" text="When an employee works for another organization, it appears here." />
      ) : (
        <div className="table-wrap" aria-busy={loading}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>From</th>
                <th>Working for</th>
                <th>Status</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((loan) => (
                <tr key={loan.loanId} className={loan.status === 'Returned' ? 'is-inactive' : ''}>
                  <td>
                    <strong>{loan.employeeName}</strong>
                    <span className="person__sub">since {formatDateTime(loan.lentAt)}</span>
                  </td>
                  <td>{loan.lenderOrgName}</td>
                  <td>
                    {loan.borrowerOrgName}
                    {loan.expectedReturnAt && loan.status !== 'Returned' && <span className="person__sub">until {formatDateTime(loan.expectedReturnAt)}</span>}
                  </td>
                  <td>
                    {loan.status === 'Lent' && <Badge tone="info" dot>Lent</Badge>}
                    {loan.status === 'RecallRequested' && (
                      <>
                        <Badge tone="danger" dot>Going back in <Countdown deadline={loan.recallDeadline} offset={data.offset} /></Badge>
                        {loan.substituteName && <span className="person__sub">replacement ready: {loan.substituteName}</span>}
                        {loan.recallReason && <span className="person__sub">{loan.recallReason}</span>}
                      </>
                    )}
                    {loan.status === 'Returned' && (
                      <>
                        <Badge tone="neutral">Returned</Badge>
                        {loan.returnedAt && <span className="person__sub">{formatDateTime(loan.returnedAt)}</span>}
                      </>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      {loan.status === 'Lent' && loan.iAmLender && (
                        <Button variant="secondary" onClick={() => setRecalling(loan)}>
                          Recall
                        </Button>
                      )}
                      {loan.status !== 'Returned' && (
                        <Button variant="secondary" loading={busy === `return-${loan.loanId}`} onClick={() => returnNow(loan)}>
                          Return now
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recalling && (
        <ConfirmDialog
          title="Ask for the employee back?"
          message={`${recalling.employeeName} goes back to ${recalling.lenderOrgName} in ${recallMinutes} minutes. ${recalling.borrowerOrgName} is told and a replacement is suggested.`}
          confirmLabel="Recall"
          onCancel={() => setRecalling(null)}
          onConfirm={async () => {
            const result = await managerAutopilotApi.recall(recalling.loanId)
            setRecalling(null)
            onNotice(result?.message || 'Recall started.')
            onChanged()
            reload()
          }}
        />
      )}
    </section>
  )
}

export default LoansPanel
