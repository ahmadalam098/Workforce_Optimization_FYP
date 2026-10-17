import { useEffect } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { dailyStaffingApi } from '../../../services/admin/adminService.js'
import { DATA_CHANGED_EVENT } from '../../../services/apiClient.js'
import { ErrorState } from '../shared/StateBox.jsx'

const STATES = {
  Complete: { tone: 'success', label: 'Minimum complete' },
  Short: { tone: 'danger', label: 'Employees missing' },
  Waiting: { tone: 'warning', label: "Today's window has not started" },
  WindowEnded: { tone: 'neutral', label: "Today's window is over" },
  NotStarted: { tone: 'neutral', label: 'Contract not started' },
  Finished: { tone: 'neutral', label: 'Contract ended' },
  OrganizationInactive: { tone: 'warning', label: 'Organization not active' },
  NoWindow: { tone: 'warning', label: 'No daily time set' },
}

/**
 * The daily staffing of one daily contract: the minimum that is appointed every day, who is appointed today, the extra employees that came
 * through staff requests. The organization manager appoints the minimum by hand for now (the AI allocation will do it later), so this is
 * only a view for the admin.
 */
function DailyStaffingCard({ contractId }) {
  const { data, error, loading, reload } = useFetch((signal) => dailyStaffingApi.status(contractId, signal), `daily-staffing-${contractId}`)

  // The numbers change when an allocation changes anywhere, so look again now and then.
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) reload()
    }
    const timer = setInterval(refresh, 30000)
    window.addEventListener(DATA_CHANGED_EVENT, refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener(DATA_CHANGED_EVENT, refresh)
    }
  }, [reload])

  const status = data?.[0]

  return (
    <section className="card" style={{ gridColumn: '1 / -1' }}>
      <div className="card__header">
        <h3 className="card__title">Daily staffing</h3>
      </div>
      <div className="card__body form-stack">
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading..." />
        ) : !status ? (
          <p className="cell-muted">This contract is not an active daily contract yet. Once it is approved, its minimum employees are appointed every day.</p>
        ) : (
          <>
            <p>
              Every day, <strong>{status.min}</strong> employee{status.min === 1 ? ' is' : 's are'} appointed to this organization by its manager for <strong>{status.window}</strong>. If it asks for
              more through a staff request, those come <strong>on top</strong>, up to the maximum{status.max != null ? ` of ${status.max}` : ''}.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem 1.25rem' }}>
              <Badge tone={STATES[status.state]?.tone ?? 'neutral'}>{STATES[status.state]?.label ?? status.state}</Badge>
              <span>
                Appointed today: <strong>{status.appointed}</strong> of {status.min}
              </span>
              <span>
                Extra from staff requests: <strong>{status.extra}</strong>
              </span>
              <span className="cell-muted">At the organization now: {status.atOrganizationNow}</span>
            </div>

            {status.stillShort > 0 && status.state === 'Short' && (
              <Alert type="warning">
                {status.stillShort} more employee{status.stillShort === 1 ? ' is' : 's are'} still to be appointed by the organization manager.
              </Alert>
            )}

            {status.employees.length > 0 && (
              <div>
                <p className="term-group__title">Appointed today</p>
                <div className="chip-list">
                  {status.employees.map((name) => (
                    <span className="chip" key={name}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <p className="cell-muted">The appointments end by themselves at the end of the daily window.</p>
          </>
        )}
      </div>
    </section>
  )
}

export default DailyStaffingCard
