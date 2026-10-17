import { useState } from 'react'
import Alert from '../ui/Alert.jsx'
import Avatar from '../ui/Avatar.jsx'
import Button from '../ui/Button.jsx'
import Icon from '../ui/Icon.jsx'
import { EmptyState } from '../../portals/admin/shared/StateBox.jsx'
import { useCalls } from './callContext.js'
import './CallScreen.css'

// Organizations, managers and employees are listed in separate groups.
const GROUPS = [
  ['Organization', 'Organizations'],
  ['Manager', 'Organization managers'],
  ['Employee', 'Employees'],
]

/**
 * The people I may call, with a green dot when they are online (connected to the call server) and Voice / Video buttons.
 * `contacts`: [{ type, id, key, name, subtitle, userId?, hasPicture? }]. Calling someone who is offline is not possible.
 * `grouped` (default) puts organizations, managers and employees under their own headings; pass false when the list is of one kind already.
 */
function CallContactList({ contacts, grouped = true, emptyTitle = 'Nobody to call yet', emptyText = 'The people you work with will appear here.' }) {
  const { startCall, isOnline, current, incoming, connected, connectProblem } = useCalls()
  const [problem, setProblem] = useState('')
  const busy = Boolean(current || incoming)

  async function call(contact, media) {
    setProblem('')
    const error = await startCall(contact, media)
    if (error) setProblem(error)
  }

  if (contacts.length === 0) return <EmptyState icon="phone" title={emptyTitle} text={emptyText} />

  return (
    <div className="form-stack">
      {!connected && <Alert type="warning">{connectProblem || 'Connecting to the call server...'}</Alert>}
      {problem && (
        <Alert type="error" onClose={() => setProblem('')}>
          {problem}
        </Alert>
      )}
      {(grouped ? GROUPS : [[null, null]]).map(([type, title]) => {
        const items = type ? contacts.filter((contact) => contact.type === type) : contacts
        if (items.length === 0) return null
        return (
          <div key={type ?? 'all'} className="form-stack">
            {title && <h4 className="term-group__title">{title}</h4>}
            <ul className="call-contacts" aria-label={title ?? 'People you can call'}>
              {items.map((contact) => {
                const live = isOnline(contact.key)
                const disabled = !live || busy || !connected
                return (
                  <li key={contact.key} className="call-contact">
                    <Avatar userId={contact.userId ?? null} name={contact.name} hasPicture={Boolean(contact.hasPicture)} />
                    <span className="call-contact__text">
                      <strong>
                        <span className={`call-contact__dot ${live ? 'is-online' : ''}`} aria-hidden="true" />
                        {contact.name}
                      </strong>
                      <span className="cell-muted">
                        {contact.subtitle} · {live ? 'Online' : 'Offline'}
                      </span>
                    </span>
                    <span className="call-contact__actions">
                      <Button variant="secondary" onClick={() => call(contact, 'audio')} disabled={disabled} title={live ? 'Voice call' : 'Offline'}>
                        <Icon name="phone" size={16} /> Voice
                      </Button>
                      <Button onClick={() => call(contact, 'video')} disabled={disabled} title={live ? 'Video call' : 'Offline'}>
                        <Icon name="video" size={16} /> Video
                      </Button>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

export default CallContactList
