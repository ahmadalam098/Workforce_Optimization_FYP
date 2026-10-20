import { useEffect, useRef } from 'react'

/** A <video> that shows a MediaStream (a remote one plays sound; a local preview is muted so you do not hear yourself). */
function StreamVideo({ stream, muted = false, className, hidden = false }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream ?? null
  }, [stream])
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} hidden={hidden} />
}

export default StreamVideo
