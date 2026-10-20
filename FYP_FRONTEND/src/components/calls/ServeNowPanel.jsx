import { useState } from 'react'
import Alert from '../ui/Alert.jsx'
import Avatar from '../ui/Avatar.jsx'
import Button from '../ui/Button.jsx'
import Icon from '../ui/Icon.jsx'
import { useCalls } from './callContext.js'
import './CallScreen.css'

/**
 * Employee: the organizations I am allocated to, each with one button that turns the video on and starts serving them live.
 * Allocation (minimum staff or extra staff accepted) is what makes an organization appear here; the API refuses a call to anyone else.
 * `organizations`: the Organization entries of /api/calls/contacts.
 */
function ServeNowPanel({ organizations }) {
  const { startCall, isOnline, current, incoming, connected } = useCalls()
  const [problem, setProblem] = useState('')
  const busy = Boolean(current || incoming)

  async function turnOn(organization) {
    setProblem('')
    const error = await startCall(organization, 'video')
    if (error) setProblem(error)
  }

  if (organizations.length === 0) return null
  return (
    <section className="card serve-now" aria-label="Serving now">
      <div className="card__header">
        <h3 className="card__title">Serving now</h3>
      </div>
      <div className="card__body form-stack">
        <p className="cell-muted">You are allocated to these organizations. Press the button to turn your video on and serve them live; their team answers the call.</p>
        {problem && (
          <Alert type="error" onClose={() => setProblem('')}>
            {problem}
          </Alert>
        )}
        <ul className="call-contacts" aria-label="Organizations I serve">
          {organizations.map((organization) => {
            const live = isOnline(organization.key)
            return (
              <li key={organization.key} className="call-contact">
                <Avatar userId={null} name={organization.name} hasPicture={false} />
                <span className="call-contact__text">
                  <strong>
                    <span className={`call-contact__dot ${live ? 'is-online' : ''}`} aria-hidden="true" />
                    {organization.name}
                  </strong>
                  <span className="cell-muted">
                    {organization.subtitle} · {live ? 'Online - ready to take your video' : 'Offline - waiting for the organization to sign in'}
                  </span>
                </span>
                <span className="call-contact__actions">
                  <Button onClick={() => turnOn(organization)} disabled={!live || busy || !connected} title={live ? 'Turn video on' : 'The organization is offline'}>
                    <Icon name="video" size={16} /> Turn video on
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

export default ServeNowPanel
