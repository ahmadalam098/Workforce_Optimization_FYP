import { peerConfiguration } from './iceConfig.js'
import { openLocalMedia, stopStream } from './localMedia.js'

// One WebRTC connection for one call. CallProvider creates it when a call is accepted and feeds it what arrives on the socket.
//
//   start({ call, isCaller, sendSignal }) - open the devices, create the RTCPeerConnection; the CALLER makes the offer.
//   handleSignal(data)                    - { type: 'offer' | 'answer' | 'candidate' } from the other person.
//   setMuted(bool) / setCameraOff(bool)   - switch the local tracks.
//   stop()                                - close everything and release the devices.
//
// The signalling messages (offer / answer / ICE) travel as the socket event `call:signal`; the chat server relays them only between the two
// people of an open call. The sound and picture themselves go directly between the browsers.
//
// onChange({ localStream, remoteStream, connection, note }) is called whenever one of those changes, so the call screen can show the videos.

export function createPeerSession(onChange = () => {}) {
  const view = { localStream: null, remoteStream: null, connection: 'new', note: '' }
  let pc = null
  let send = () => {}
  let stopped = false
  let ready = false
  const waiting = [] // signals that arrived before the connection existed
  const candidates = [] // ICE candidates that arrived before the remote description

  const publish = (patch) => {
    Object.assign(view, patch)
    if (!stopped) onChange({ ...view })
  }

  async function flushCandidates() {
    while (candidates.length) await pc.addIceCandidate(candidates.shift()).catch(() => {})
  }

  async function applySignal(data) {
    if (!pc || !data) return
    try {
      if (data.type === 'offer') {
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
        await flushCandidates()
        await pc.setLocalDescription(await pc.createAnswer())
        send({ type: 'answer', sdp: pc.localDescription.sdp })
      } else if (data.type === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp })
        await flushCandidates()
      } else if (data.type === 'candidate' && data.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate)
        else candidates.push(data.candidate)
      }
    } catch (problem) {
      publish({ connection: 'failed', note: `The connection could not be set up (${problem?.message ?? 'unknown error'}).` })
    }
  }

  return {
    async start({ call, isCaller, sendSignal }) {
      send = sendSignal
      const wantVideo = call.media === 'video'
      const { stream, note } = await openLocalMedia(wantVideo)
      if (stopped) {
        stopStream(stream)
        return
      }
      pc = new RTCPeerConnection(peerConfiguration())
      pc.onicecandidate = (event) => event.candidate && send({ type: 'candidate', candidate: event.candidate.toJSON() })
      pc.ontrack = (event) => {
        const remote = view.remoteStream ?? new MediaStream()
        if (!remote.getTracks().includes(event.track)) remote.addTrack(event.track)
        publish({ remoteStream: remote })
      }
      pc.onconnectionstatechange = () => publish({ connection: pc.connectionState })

      // Send what we have; for what we do not have, still ask for the other side's (a receive-only line).
      for (const kind of wantVideo ? ['audio', 'video'] : ['audio']) {
        const track = stream?.getTracks().find((item) => item.kind === kind)
        if (track) pc.addTrack(track, stream)
        else pc.addTransceiver(kind, { direction: 'recvonly' })
      }
      publish({ localStream: stream, note })
      ready = true

      if (isCaller) {
        await pc.setLocalDescription(await pc.createOffer())
        send({ type: 'offer', sdp: pc.localDescription.sdp })
      }
      while (waiting.length) await applySignal(waiting.shift())
    },
    /** What this browser currently sends and receives (the monitor link copies it for a watching manager). */
    snapshot() {
      return { ...view }
    },
    handleSignal(data) {
      if (!ready) waiting.push(data)
      else applySignal(data)
    },
    setMuted(muted) {
      view.localStream?.getAudioTracks().forEach((track) => (track.enabled = !muted))
    },
    setCameraOff(off) {
      view.localStream?.getVideoTracks().forEach((track) => (track.enabled = !off))
    },
    stop() {
      stopped = true
      stopStream(view.localStream)
      view.remoteStream?.getTracks().forEach((track) => track.stop())
      pc?.close()
      pc = null
    },
  }
}
