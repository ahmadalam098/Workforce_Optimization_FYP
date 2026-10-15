import { useState } from 'react'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import { EmptyState } from '../../admin/shared/StateBox.jsx'

const TABS = [
  { id: 'transcript', label: 'Transcript' },
  { id: 'review', label: 'Review and score' },
]

/**
 * The place where one monitored session is watched: the player (audio / video), the transcript, and the manager's review.
 * SLOT: while there is no session (nothing is recorded yet) the controls are shown switched off. When a session is passed in, wire
 * `session.mediaUrl` into the player and `session.transcript` into the list (shape: see performanceSlots.js).
 */
function SessionViewer({ session }) {
  const [tab, setTab] = useState('transcript')
  const ready = Boolean(session)

  return (
    <section className="card perf-viewer">
      <div className="card__header">
        <h3 className="card__title">{ready ? `${session.employeeName} · ${session.organizationName}` : 'Session viewer'}</h3>
      </div>

      <div className="card__body perf-viewer__body">
        <div className="perf-player" aria-label="Player">
          <div className="perf-player__screen">
            <Icon name="play" size={34} />
            <p>{ready ? 'Press play' : 'Choose a session to play the audio or video here'}</p>
          </div>
          <div className="perf-player__bar" aria-hidden="true">
            <button type="button" disabled>
              <Icon name="play" size={16} />
            </button>
            <div className="perf-player__track">
              <span />
            </div>
            <span className="perf-player__time">0:00 / 0:00</span>
          </div>
        </div>

        <div className="tabs" role="tablist" aria-label="Session details">
          {TABS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`tabs__tab ${tab === item.id ? 'is-active' : ''}`} onClick={() => setTab(item.id)}>
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'transcript' ? (
          <EmptyState icon="message" title="No transcript" text="What was said (or written, in a chat) will be shown here, line by line." />
        ) : (
          <form className="form-stack" onSubmit={(event) => event.preventDefault()}>
            <TextArea label="Your review" rows={3} placeholder="Write how the employee handled this session" disabled />
            <div>
              <Button type="submit" disabled>
                Save review and score
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}

export default SessionViewer
