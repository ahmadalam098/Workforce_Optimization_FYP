import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import CallContactList from '../../../components/calls/CallContactList.jsx'
import CallHistory from '../../../components/calls/CallHistory.jsx'
import { useCalls } from '../../../components/calls/callContext.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { callsApi } from '../../../services/calls/callsService.js'
import { organizationTeamApi } from '../../../services/organization/organizationService.js'
import { formatDateTime } from '../../../utils/format.js'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { ErrorState } from '../../admin/shared/StateBox.jsx'

/**
 * Organization: your team right now - the employees who accepted the manager's offer and work for you. They show as online when they are
 * signed in; call them by voice or video. Your manager can also call you, and can cut a call if something is wrong.
 */
function OrganizationTeamPage() {
  const { me, tick } = useCalls()
  const { data: team, error, loading, reload } = useFetch((signal) => organizationTeamApi.team(signal), 'organization-team')
  const { data: contacts, reload: reloadContacts } = useFetch((signal) => callsApi.contacts(signal), 'organization-call-contacts')
  const { data: history, reload: reloadHistory } = useFetch((signal) => callsApi.history(signal), 'organization-call-history')

  useEffect(() => {
    if (tick > 0) reloadHistory()
  }, [tick, reloadHistory])
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) {
        reload()
        reloadContacts()
      }
    }, 30000)
    return () => clearInterval(timer)
  }, [reload, reloadContacts])

  const employees = (contacts ?? []).filter((contact) => contact.type === 'Employee')
  const managers = (contacts ?? []).filter((contact) => contact.type === 'Manager')
  const details = new Map((team ?? []).map((member) => [member.userId, member]))

  return (
    <div className="page">
      <PageHeader title="Live Team" description="The employees working for you right now. A green dot means they are online; call them by voice or video." />
      <Alert type="info">Calls use your camera and microphone (allow them when the browser asks). Employees allocated to you turn their video on from their Calls page; you can also call them or your manager.</Alert>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Your team</h3>
          {team && <Badge tone="gold">{team.length} working</Badge>}
        </div>
        <div className="card__body">
          {error && !team ? (
            <ErrorState error={error} onRetry={reload} />
          ) : !team && loading ? (
            <Spinner label="Loading..." />
          ) : (
            <CallContactList
              grouped={false}
              contacts={employees.map((contact) => {
                const member = details.get(contact.id)
                return { ...contact, hasPicture: member?.hasPicture, userId: contact.id, subtitle: member ? `${member.isMinimum ? 'Regular team' : 'Extra staff'} · since ${formatDateTime(member.since)}${member.skills.length ? ` · ${member.skills.join(', ')}` : ''}` : contact.subtitle }
              })}
              emptyTitle="Nobody is working for you right now"
              emptyText="When your manager sends your request to employees and they accept, they appear here. Ask for extra employees in Staff Requests."
            />
          )}
          <p className="cell-muted">
            Want more people? <Link to="/organization/requests">Ask for extra employees</Link>.
          </p>
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Your manager</h3>
        </div>
        <div className="card__body">
          <CallContactList grouped={false} contacts={managers} emptyTitle="No manager yet" emptyText="The administrator has not linked a manager to your organization." />
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Recent calls</h3>
        </div>
        <div className="card__body">
          <CallHistory calls={history ?? []} meKey={me?.key} />
        </div>
      </section>
    </div>
  )
}

export default OrganizationTeamPage
