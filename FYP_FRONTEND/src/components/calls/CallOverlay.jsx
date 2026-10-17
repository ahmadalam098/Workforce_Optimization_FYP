import { useEffect, useState } from 'react'
import { getInitials } from '../../utils/format.js'
import { useCalls } from './callContext.js'
import './CallScreen.css'

const KIND = { audio: 'Voice call', video: 'Video call' }

function duration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

const WHO = { Employee: 'Employee', Manager: 'Organization manager', Organization: 'Organization' }

/**
 * What the person sees of a call, on any page of the portal: an incoming call (Accept / Decline), the call screen (calling, then connected
 * with a timer, mute, camera, hang up) and a short notice when a call ended (for example cut by the manager). No sound or picture yet.
 */
function CallOverlay({ peerOf }) {
  const { incoming, current, notice, clearNotice, answer, hangUp, toggle } = useCalls()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!current?.startedAt) return undefined
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [current?.startedAt])

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(clearNotice, 8000)
    return () => clearTimeout(timer)
  }, [notice, clearNotice])

  const toast = notice && (
    <div className="call-toast" role="status">
      <span>{notice}</span>
      <button type="button" onClick={clearNotice} aria-label="Dismiss">
        ×
      </button>
    </div>
  )

  if (incoming && !current) {
    const peer = peerOf(incoming)
    return (
      <>
        <div className="call-screen" role="alertdialog" aria-modal="true" aria-label={`Incoming ${KIND[incoming.media]} from ${peer.name}`}>
          <div className="call-screen__panel">
            <span className="call-screen__demo">Demo media - no sound or picture yet</span>
            <div className="call-screen__avatar" aria-hidden="true">
              {getInitials(peer.name || '?')}
            </div>
            <h2 className="call-screen__name">{peer.name}</h2>
            <p className="call-screen__sub">
              {WHO[peer.type]} · {KIND[incoming.media]}
            </p>
            <p className="call-screen__status" aria-live="assertive">
              Calling you...
            </p>
            <div className="call-screen__controls">
              <button type="button" className="call-control call-control--accept" onClick={() => answer(true)}>
                Accept
              </button>
              <button type="button" className="call-control call-control--hangup" onClick={() => answer(false)}>
                Decline
              </button>
            </div>
          </div>
        </div>
        {toast}
      </>
    )
  }

  if (current) {
    const { call } = current
    const peer = peerOf(call)
    const connected = call.status === 'Active' && current.startedAt
    const video = call.media === 'video'
    return (
      <>
        <div className="call-screen" role="dialog" aria-modal="true" aria-label={`${KIND[call.media]} with ${peer.name}`}>
          <div className="call-screen__panel">
            <span className="call-screen__demo">Demo media - no sound or picture yet</span>
            {video ? (
              <div className="call-screen__video" aria-hidden="true">
                <div className="call-screen__avatar">{getInitials(peer.name || '?')}</div>
                <div className="call-screen__self">{current.cameraOff ? 'Camera off' : 'You'}</div>
                <span className="call-screen__video-note">Video will appear here when WebRTC is connected</span>
              </div>
            ) : (
              <div className="call-screen__avatar" aria-hidden="true">
                {getInitials(peer.name || '?')}
              </div>
            )}
            <h2 className="call-screen__name">{peer.name}</h2>
            <p className="call-screen__sub">
              {WHO[peer.type]} · {KIND[call.media]}
            </p>
            <p className="call-screen__status" aria-live="polite">
              {connected ? duration((now - current.startedAt) / 1000) : `Calling ${peer.name}...`}
            </p>
            <div className="call-screen__controls">
              {connected && (
                <button type="button" className={`call-control ${current.muted ? 'is-on' : ''}`} onClick={() => toggle('muted')} aria-pressed={current.muted}>
                  {current.muted ? 'Unmute' : 'Mute'}
                </button>
              )}
              {connected && video && (
                <button type="button" className={`call-control ${current.cameraOff ? 'is-on' : ''}`} onClick={() => toggle('cameraOff')} aria-pressed={current.cameraOff}>
                  {current.cameraOff ? 'Camera on' : 'Camera off'}
                </button>
              )}
              <button type="button" className="call-control call-control--hangup" onClick={hangUp}>
                {connected ? 'Hang up' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
        {toast}
      </>
    )
  }

  return toast || null
}

export default CallOverlay
