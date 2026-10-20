import { peerConfiguration } from './iceConfig.js'

// Watching a live call (organization manager, Performance Monitoring). The manager only watches: nothing is sent from the manager to the call,
// the two people are not interrupted, and the watch ends by itself when the call ends.
//
// The employee's browser already has both sides of the call (its own camera and the organization's picture). When the manager presses
// "Watch live", the employee's browser opens a SECOND WebRTC connection to the manager and sends those two streams over it (split screen on
// the manager's side). The signalling goes through the chat server as `call:watch-signal`.
//
// The offer / answer are sent ONCE, with every ICE candidate inside (no trickling), so a computer with many network adapters cannot flood the
// relay. If the direct connection is still not up after a few seconds, the manager asks for the FALLBACK: the employee's browser sends small
// still pictures of both sides a few times a second through the chat server (`call:watch-frame`) - picture only, but it always works.
//
//   createMonitorSender({ getStreams, send, sendFrame }) - employee side.
//   createMonitorViewer({ send, onChange })               - manager side: onChange({ streams, layout, connection, frames, fallback }).
//   `layout` = { local, remote } stream ids: which stream is the employee and which the organization.

const GATHER_MS = 3000
export const FALLBACK_AFTER_MS = 8000
const FRAME_MS = 400

/** Resolves when the connection has found its network addresses (or after GATHER_MS), so the description already holds them. */
function gathered(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((done) => {
    const timer = setTimeout(done, GATHER_MS)
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timer)
        done()
      }
    })
  })
}

/** Paints a stream's picture into a small JPEG (data URL), or null when it has no picture yet. */
function framer(stream) {
  if (!stream?.getVideoTracks().length) return () => null
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = stream
  video.play().catch(() => {})
  const canvas = document.createElement('canvas')
  return () => {
    if (!video.videoWidth) return null
    const width = 320
    canvas.width = width
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * width)
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.6)
  }
}

export function createMonitorSender({ getStreams, send, sendFrame }) {
  const pc = new RTCPeerConnection(peerConfiguration())
  let timer = null

  return {
    async start() {
      const { localStream, remoteStream } = getStreams()
      localStream?.getTracks().forEach((track) => pc.addTrack(track, localStream))
      remoteStream?.getTracks().forEach((track) => pc.addTrack(track, remoteStream))
      send({ type: 'layout', local: localStream?.id ?? null, remote: remoteStream?.id ?? null })
      // Nothing to send (no camera or microphone on either side): the manager is told that through the layout alone.
      if (!pc.getSenders().some((item) => item.track)) return
      await pc.setLocalDescription(await pc.createOffer())
      await gathered(pc)
      send({ type: 'offer', sdp: pc.localDescription.sdp })
    },
    async handleSignal(data) {
      if (data.type === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp }).catch(() => {})
      } else if (data.type === 'frames' && !timer) {
        const { localStream, remoteStream } = getStreams()
        const local = framer(localStream)
        const remote = framer(remoteStream)
        timer = setInterval(() => sendFrame({ local: local(), remote: remote() }), FRAME_MS)
      }
    },
    stop() {
      clearInterval(timer)
      pc.close()
    },
  }
}

export function createMonitorViewer({ send, onChange }) {
  const pc = new RTCPeerConnection(peerConfiguration())
  const view = { streams: [], layout: null, connection: 'new', frames: null, fallback: false }
  let stopped = false
  const publish = (patch) => {
    Object.assign(view, patch)
    if (!stopped) onChange({ ...view, streams: [...view.streams] })
  }

  pc.ontrack = (event) => {
    const stream = event.streams[0]
    if (stream && !view.streams.some((item) => item.id === stream.id)) publish({ streams: [...view.streams, { id: stream.id, stream }] })
    else publish({})
  }
  pc.onconnectionstatechange = () => {
    publish({ connection: pc.connectionState })
    if (pc.connectionState === 'failed') askForFrames()
  }

  function askForFrames() {
    if (stopped || view.fallback) return
    publish({ fallback: true })
    send({ type: 'frames' })
  }
  // Not connected directly after a while: switch to the still pictures.
  const fallbackTimer = setTimeout(() => {
    if (pc.connectionState !== 'connected') askForFrames()
  }, FALLBACK_AFTER_MS)

  return {
    async handleSignal(data) {
      try {
        if (data.type === 'layout') {
          publish({ layout: { local: data.local, remote: data.remote } })
        } else if (data.type === 'offer') {
          await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
          await pc.setLocalDescription(await pc.createAnswer())
          await gathered(pc)
          send({ type: 'answer', sdp: pc.localDescription.sdp })
        }
      } catch {
        askForFrames()
      }
    },
    handleFrame({ local, remote }) {
      publish({ frames: { local, remote } })
    },
    stop() {
      stopped = true
      clearTimeout(fallbackTimer)
      pc.close()
    },
  }
}
