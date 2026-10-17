// The media of a call (microphone, camera, WebRTC peer connection).
//
// DUMMY on purpose: the call flow (ringing, answering, ending, the manager cutting a call, the live signalling relay on the chat server and the
// call screen) is real, but no sound or picture travels yet. This file is the ONE place to replace when WebRTC is built:
//
//   start({ call, isCaller, sendSignal })  - get the microphone / camera, create the RTCPeerConnection; the caller creates the offer and
//                                            sends it with sendSignal({ type: 'offer', sdp }); ICE candidates go the same way.
//   handleSignal(data)                     - an { type: 'offer' | 'answer' | 'candidate' } arrived from the other person: apply it.
//   setMuted(bool) / setCameraOff(bool)    - switch the local tracks.
//   stop()                                 - close the peer connection and stop the tracks.
//
// Everything else (CallProvider, CallOverlay, the pages and the server) keeps working unchanged. The chat server already relays whatever is
// passed to sendSignal as the socket event `call:signal`.

export function createCallMedia() {
  let state = { muted: false, cameraOff: false, running: false }
  let send = () => {}

  return {
    start({ call, sendSignal }) {
      state = { ...state, running: true }
      send = sendSignal
      // Dummy: tell the other side that we are ready, so the signalling path is exercised end to end.
      send({ type: 'dummy-ready', media: call.media })
    },
    handleSignal() {
      // Dummy: nothing to apply. Real WebRTC: setRemoteDescription / addIceCandidate here.
    },
    setMuted(muted) {
      state = { ...state, muted }
    },
    setCameraOff(cameraOff) {
      state = { ...state, cameraOff }
    },
    stop() {
      state = { ...state, running: false }
    },
    get state() {
      return state
    },
  }
}
