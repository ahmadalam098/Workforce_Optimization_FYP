// Gets the microphone / camera of this device. Never throws: a call still connects when the device has nothing to share (the person can
// still see and hear the other side) and the screen explains why.

/** True only on https:// pages and on localhost - browsers hand out the camera and microphone nowhere else. */
export const canUseDevices = () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

/**
 * wantVideo: true for a video call. Resolves to { stream (or null), note ('' when everything worked) }.
 * Order: audio + video, then audio only, then nothing.
 */
export async function openLocalMedia(wantVideo) {
  if (!canUseDevices()) {
    return {
      stream: null,
      note: 'This page cannot use the camera or microphone because it is not opened through https or localhost. Open the site as http://localhost:5173 on this computer, or serve it over https on other devices.',
    }
  }
  try {
    return { stream: await navigator.mediaDevices.getUserMedia({ audio: true, video: wantVideo }), note: '' }
  } catch (first) {
    if (wantVideo) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        return { stream, note: 'Your camera could not be opened, so you are sharing sound only.' }
      } catch {
        /* fall through to the explanation below */
      }
    }
    const denied = first?.name === 'NotAllowedError' || first?.name === 'SecurityError'
    return {
      stream: null,
      note: denied ? 'The browser did not allow the microphone / camera. Allow it for this site (the lock icon in the address bar) and call again.' : 'No microphone or camera was found on this device, so you can only watch and listen.',
    }
  }
}

export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop())
}
