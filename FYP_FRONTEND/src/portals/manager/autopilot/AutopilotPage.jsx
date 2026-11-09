import { useEffect, useState } from 'react'
import Badge from '../../../components/ui/Badge.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { managerAutopilotApi } from '../../../services/manager/managerService.js'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import DecisionsPanel from './DecisionsPanel.jsx'
import LoansPanel from './LoansPanel.jsx'
import OrganizationAutopilotCard from './OrganizationAutopilotCard.jsx'
import './autopilot.css'

const REFRESH_MS = 8000

/**
 * Organization Manager: the AI autopilot. Switch it on for an organization and it keeps the contract minimum and the approved staff requests
 * filled with the best-fit employees, lends and recalls employees between organizations, and gives the reason of every choice. You stay in
 * control: suggest only, apply or reject, undo, lock an employee, recall a loan.
 */
function AutopilotPage() {
  const [notice, setNotice] = useFlashNotice()
  const [refreshKey, setRefreshKey] = useState(0)
  const { data, error, loading, reload } = useFetch((signal) => managerAutopilotApi.overview(signal), 'manager-autopilot')

  // The autopilot works by itself in the background, so the page looks again every few seconds.
  useEffect(() => {
    const timer = setInterval(() => {
      reload()
      setRefreshKey((key) => key + 1)
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [reload])

  const changed = () => {
    reload()
    setRefreshKey((key) => key + 1)
  }
  const orgs = data?.organizations ?? []

  return (
    <div className="page">
      <PageHeader
        title="AI Autopilot"
        description="Switch the autopilot on and the AI keeps your contracts staffed from the best-fit employees, borrows spare employees from other organizations when yours run out, and sends them back when the work ends or their owner needs them. Every choice has a reason, and you can undo, lock or override anything."
      />
      <Notice message={notice} onClose={() => setNotice('')} />

      {data && (
        <p className="ap-planner">
          Planner in use: <Badge tone={data.planner.mode === 'AI service' ? 'success' : 'info'} dot>{data.planner.mode}</Badge>
          {data.planner.configured && !data.planner.reachable ? <span>The AI service does not answer, so the built-in planner decides.</span> : null}
        </p>
      )}

      {error && !data ? (
        <section className="card">
          <ErrorState error={error} onRetry={reload} />
        </section>
      ) : !data && loading ? (
        <Spinner label="Loading the autopilot..." />
      ) : orgs.length === 0 ? (
        <section className="card">
          <EmptyState icon="building" title="No organizations" text="You do not manage an organization yet." />
        </section>
      ) : (
        <>
          {orgs.map((org) => (
            <OrganizationAutopilotCard key={org.orgId} org={org} onChanged={changed} onNotice={setNotice} />
          ))}
          <DecisionsPanel orgs={orgs} refreshKey={refreshKey} onChanged={changed} onNotice={setNotice} />
          <LoansPanel refreshKey={refreshKey} recallMinutes={data.recallMinutes} onChanged={changed} onNotice={setNotice} />
        </>
      )}
    </div>
  )
}

export default AutopilotPage
