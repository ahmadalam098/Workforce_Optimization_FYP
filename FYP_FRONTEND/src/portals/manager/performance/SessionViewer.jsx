import { useEffect, useState } from 'react'
import StreamVideo from '../../../components/calls/StreamVideo.jsx'
import { useCalls } from '../../../components/calls/callContext.js'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import { formatDateTime } from '../../../utils/format.js'
import { EmptyState } from '../../admin/shared/StateBox.jsx'

const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'review', label: 'Review and score' },
]

const STATUS = { Ringing: 'Ringing', Active: 'On the call', Ended: 'Ended', Missed: 'Missed', Declined: 'Declined', Cancelled: 'Cancelled', Cut: 'Cut by you' }

function length(total) {
  return total > 0 ? `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}` : '—'
}

/**
 * The place where one monitored session is watched. A call that is happening shows LIVE with the button to cut it (for example for unethical
 * behaviour); a finished call shows how it went. The player, the transcript and the review are still empty: nothing is recorded yet (live calls can be
 * watched with Watch live, but are not stored). SLOT: when `session.mediaUrl` / `session.transcript` exist, wire them into the player and the list.
 */
function SessionViewer({ session, onCut }) {
  const [tab, setTab] = useState('details')
  const [problem, setProblem] = useState('')
  const { watch, stopWatching, watching } = useCalls()
  const ready = Boolean(session)
  const isWatching = ready && watching?.callId === session.sessionId
  const watchedId = ready ? session.sessionId : null
  const stillLive = ready && session.live

  // Leave the call when another session is chosen or the call is over.
  useEffect(() => {
    if (watching && (watching.callId !== watchedId || !stillLive)) stopWatching()
  }, [watching, watchedId, stillLive, stopWatching])

  async function watchLive() {
    setProblem('')
    setProblem(await watch(session.sessionId))
  }
  const [slowFor, setSlowFor] = useState(null)
  const waitingForEmployee = isWatching && !watching.layout
  useEffect(() => {
    if (!waitingForEmployee) return undefined
    const timer = setTimeout(() => setSlowFor(watchedId), 10000)
    return () => clearTimeout(timer)
  }, [waitingForEmployee, watchedId])
  const slow = waitingForEmployee && slowFor === watchedId

  // Split screen: the employee on one side, the organization on the other. Each side shows the live video, or the fallback still picture.
  const sides = isWatching && watching.layout
    ? [
        { role: 'local', who: 'Employee', name: session.employeeName },
        { role: 'remote', who: 'Organization', name: session.organizationName },
      ].map((side) => ({
        ...side,
        stream: watching.streams.find((item) => item.id === watching.layout[side.role])?.stream ?? null,
        frame: watching.frames?.[side.role] ?? null,
      }))
    : []
  const mode = !isWatching ? '' : watching.connection === 'connected' ? 'Live video and sound' : watching.fallback ? 'Pictures only (the direct connection could not be made, so still pictures are sent a few times a second)' : 'Connecting...'

  return (
    <section className="card perf-viewer">
      <div className="card__header">
        <h3 className="card__title">{ready ? `${session.employeeName} · ${session.organizationName}` : 'Session viewer'}</h3>
        {ready && session.live && <Badge tone="danger">LIVE</Badge>}
      </div>

      <div className="card__body perf-viewer__body">
        <div className="perf-player" aria-label="Player">
          {sides.length > 0 ? (
            <>
              <div className="perf-live" aria-label="The call, split screen">
                {sides.map((side) => {
                  const live = watching.connection === 'connected' && Boolean(side.stream?.getVideoTracks().length)
                  return (
                    <figure key={side.role} className="perf-live__tile">
                      <StreamVideo stream={side.stream} hidden={!live} />
                      {!live && side.frame && <img src={side.frame} alt={`${side.who}: ${side.name}`} />}
                      {!live && !side.frame && <span className="perf-live__empty">{watching.fallback ? 'No camera on this side' : side.stream ? 'Sound only - no picture' : 'Waiting for the picture...'}</span>}
                      <figcaption>
                        {side.who}: {side.name}
                      </figcaption>
                    </figure>
                  )
                })}
              </div>
              <p className="perf-live__mode">{mode} · you are only watching: they cannot see or hear you.</p>
            </>
          ) : (
            <div className="perf-player__screen">
              <Icon name={ready && session.live ? 'phone' : 'play'} size={34} />
              <p>{!ready ? 'Choose a session to see it here' : isWatching ? (slow ? "The employee's browser did not answer. Ask them to refresh the page and start the call again (both pages must be on the latest version)." : 'Connecting to the live call...') : session.live ? 'This call is happening now. Press "Watch live" to see both sides.' : 'No recording for this call yet'}</p>
            </div>
          )}
          {!isWatching && (
            <div className="perf-player__bar" aria-hidden="true">
              <button type="button" disabled>
                <Icon name="play" size={16} />
              </button>
              <div className="perf-player__track">
                <span />
              </div>
              <span className="perf-player__time">0:00 / {ready ? length(session.durationSeconds) : '0:00'}</span>
            </div>
          )}
        </div>

        {ready && session.live && (
          <div className="perf-viewer__actions">
            {session.status === 'Active' &&
              (isWatching ? (
                <Button variant="secondary" onClick={stopWatching}>
                  <Icon name="close" size={16} /> Stop watching
                </Button>
              ) : (
                <Button onClick={watchLive}>
                  <Icon name="video" size={16} /> Watch live
                </Button>
              ))}
            <Button variant="secondary" onClick={() => onCut(session)}>
              <Icon name="close" size={16} /> Cut this call
            </Button>
            {problem && <p className="cell-muted">{problem}</p>}
            <p className="cell-muted">Both people are told at once and your reason is recorded.</p>
          </div>
        )}

        <div className="tabs" role="tablist" aria-label="Session details">
          {TABS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`tabs__tab ${tab === item.id ? 'is-active' : ''}`} onClick={() => setTab(item.id)}>
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'details' &&
          (ready ? (
            <dl className="info-list">
              <div className="info-item">
                <dt>Between</dt>
                <dd>
                  {session.caller} → {session.callee}
                </dd>
              </div>
              <div className="info-item">
                <dt>Type</dt>
                <dd>{session.type === 'video' ? 'Video call' : 'Voice call'}</dd>
              </div>
              <div className="info-item">
                <dt>Started</dt>
                <dd>{formatDateTime(session.startedAt)}</dd>
              </div>
              <div className="info-item">
                <dt>Result</dt>
                <dd>{STATUS[session.status] ?? session.status}</dd>
              </div>
              <div className="info-item">
                <dt>Length</dt>
                <dd>{length(session.durationSeconds)}</dd>
              </div>
              {session.endReason && (
                <div className="info-item">
                  <dt>Why it was cut</dt>
                  <dd>{session.endReason}</dd>
                </div>
              )}
            </dl>
          ) : (
            <EmptyState icon="activity" title="No session chosen" text="Choose a call from the list to see how it went." />
          ))}
        {tab === 'transcript' && <EmptyState icon="message" title="No transcript" text="What was said (or written, in a chat) will be shown here, line by line, when calls are recorded." />}
        {tab === 'review' && (
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
