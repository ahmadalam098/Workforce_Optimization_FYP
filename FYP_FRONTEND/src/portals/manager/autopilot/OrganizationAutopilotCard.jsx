import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import { managerAutopilotApi } from '../../../services/manager/managerService.js'
import { formatDateTime } from '../../../utils/format.js'

const SOURCE_TONE = { AI: 'gold', Loan: 'info', Manual: 'neutral' }

/** One organization: the autopilot switch, what the contract needs, who works there and the buttons to run, plan or lock. */
function OrganizationAutopilotCard({ org, onChanged, onNotice }) {
  const [busy, setBusy] = useState('')
  const [problem, setProblem] = useState('')

  async function act(key, call) {
    setBusy(key)
    setProblem('')
    try {
      const result = await call()
      onNotice(result?.message || 'Done.')
      onChanged()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy('')
    }
  }

  const noContract = org.contractId == null

  return (
    <section className="card">
      <div className="card__header">
        <h3 className="card__title">
          {org.orgName}
          {org.contractNumber ? ` · ${org.contractNumber}` : ''}
        </h3>
        <Badge tone={org.enabled ? 'success' : 'neutral'} dot>
          {org.enabled ? 'Autopilot ON' : 'Autopilot OFF'}
        </Badge>
      </div>
      <div className="card__body form-stack">
        {problem && (
          <Alert type="error" onClose={() => setProblem('')}>
            {problem}
          </Alert>
        )}
        {noContract ? (
          <Alert type="info">{org.problem || 'This organization has no active contract, so there is nothing to staff.'}</Alert>
        ) : (
          <>
            <div className="ap-stats">
              <div className="ap-stat">
                <p className="ap-stat__label">Minimum</p>
                <p className="ap-stat__value">{org.min}</p>
              </div>
              <div className="ap-stat">
                <p className="ap-stat__label">Maximum</p>
                <p className="ap-stat__value">{org.max ?? 'any'}</p>
              </div>
              <div className="ap-stat">
                <p className="ap-stat__label">Placed (minimum)</p>
                <p className="ap-stat__value">{org.have}</p>
              </div>
              <div className={`ap-stat ${org.missing > 0 ? 'ap-stat--short' : ''}`}>
                <p className="ap-stat__label">Missing</p>
                <p className="ap-stat__value">{org.missing}</p>
              </div>
              <div className="ap-stat">
                <p className="ap-stat__label">Working now</p>
                <p className="ap-stat__value">{org.atOrg}</p>
              </div>
            </div>
            <p className="cell-muted">
              {org.isDaily && org.window ? `Daily contract, ${org.window}. ` : ''}
              {org.borrowingAllowed ? 'The contract allows borrowing employees from other organizations.' : 'The contract does not allow borrowing: only your own employees are used.'}
              {org.problem ? ` ${org.problem}` : ''}
            </p>
          </>
        )}

        {org.lastMessage && (
          <p className="ap-last">
            <Icon name="sparkles" size={15} /> {org.lastMessage}
            {org.lastRunAt ? <span className="cell-muted"> · {formatDateTime(org.lastRunAt)}</span> : null}
          </p>
        )}

        <div className="ap-actions">
          <Button
            variant={org.enabled ? 'secondary' : 'primary'}
            loading={busy === 'switch'}
            disabled={noContract && !org.enabled}
            onClick={() => act('switch', () => managerAutopilotApi.setEnabled(org.orgId, !org.enabled))}
          >
            <Icon name="sparkles" size={17} /> {org.enabled ? 'Turn autopilot off' : 'Turn autopilot on'}
          </Button>
          <Button variant="secondary" loading={busy === 'plan'} disabled={noContract} onClick={() => act('plan', () => managerAutopilotApi.run(org.orgId, false))}>
            <Icon name="search" size={17} /> Suggest only
          </Button>
          <Button variant="secondary" loading={busy === 'run'} disabled={noContract} onClick={() => act('run', () => managerAutopilotApi.run(org.orgId, true))}>
            <Icon name="play" size={17} /> Place now
          </Button>
          <Button
            variant="secondary"
            loading={busy === 'ask'}
            title={org.askEmployees ? 'The employee gets an offer and is placed only after accepting. Click to place at once instead.' : 'Employees are placed at once. Click to ask them first.'}
            onClick={() => act('ask', () => managerAutopilotApi.setAskEmployees(org.orgId, !org.askEmployees))}
          >
            <Icon name="user" size={17} /> {org.askEmployees ? 'Asking employees first' : 'Placing at once'}
          </Button>
        </div>
        <p className="cell-muted">
          {org.askEmployees
            ? `The AI sends each chosen employee an offer; they are placed when they accept. Offers waiting: ${org.offersWaiting}.`
            : 'The AI places employees at once; they are told in their notifications.'}
        </p>

        {org.working.length === 0 ? (
          <p className="cell-muted">Nobody works for this organization right now.</p>
        ) : (
          <ul className="ap-people" aria-label={`Employees working for ${org.orgName}`}>
            {org.working.map((person) => (
              <li key={person.allocationId} className="ap-person">
                <span className="ap-person__name">{person.name}</span>
                <Badge tone={SOURCE_TONE[person.source] ?? 'neutral'}>{person.source === 'AI' ? 'Placed by AI' : person.source === 'Loan' ? 'Borrowed by AI' : 'Manual'}</Badge>
                {person.isLoan && <span className="ap-person__sub">from {person.homeOrgName}</span>}
                {person.until && <span className="ap-person__sub">until {formatDateTime(person.until)}</span>}
                <span className="ap-person__spacer" />
                <Button
                  variant="secondary"
                  loading={busy === `lock-${person.allocationId}`}
                  title={person.locked ? 'The AI never moves this employee. Click to unlock.' : 'Lock: the AI will not release or move this employee.'}
                  onClick={() => act(`lock-${person.allocationId}`, () => managerAutopilotApi.lock(person.allocationId, !person.locked))}
                >
                  <Icon name="lock" size={16} /> {person.locked ? 'Locked' : 'Lock'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default OrganizationAutopilotCard
