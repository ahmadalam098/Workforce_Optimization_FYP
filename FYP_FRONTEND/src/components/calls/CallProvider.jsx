import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { connectChatSocket } from '../../services/manager/chatService.js'
import { callsApi } from '../../services/calls/callsService.js'
import { CallContext } from './callContext.js'
import { createCallMedia } from './callMedia.js'
import CallOverlay from './CallOverlay.jsx'

const peerOf = (call, me) => (call.caller.key === me?.key ? call.callee : call.caller)

/**
 * Keeps one live connection per portal for calls: who is online, the incoming call, the call in progress, and the manager cutting a call.
 * The portal layouts wrap their pages in it, so a call can ring on any page. The sound and picture are a dummy for now (see callMedia.js).
 */
function CallProvider({ children }) {
  const [me, setMe] = useState(null)
  const [connected, setConnected] = useState(false)
  const [connectProblem, setConnectProblem] = useState('')
  const [online, setOnline] = useState(() => new Set())
  const [incoming, setIncoming] = useState(null)
  const [current, setCurrent] = useState(null) // { call, muted, cameraOff }
  const [notice, setNotice] = useState('')
  const [tick, setTick] = useState(0)
  const socketRef = useRef(null)
  const meRef = useRef(null)
  const currentRef = useRef(null)
  const mediaRef = useRef(null)

  useEffect(() => {
    meRef.current = me
  }, [me])
  useEffect(() => {
    currentRef.current = current
  }, [current])

  const finish = useCallback((call, text) => {
    mediaRef.current?.stop()
    mediaRef.current = null
    setIncoming((now) => (now && now.callId === call.callId ? null : now))
    setCurrent((now) => (now && now.call.callId === call.callId ? null : now))
    if (text) setNotice(text)
  }, [])

  const describeEnd = useCallback((call) => {
    const peer = peerOf(call, meRef.current)
    if (call.status === 'Cut') return `Your call with ${peer.name} was ended by the organization manager${call.endReason ? `: ${call.endReason}` : '.'}`
    if (call.status === 'Missed') return `${peer.name} did not answer.`
    if (call.status === 'Declined') return call.callee.key === meRef.current?.key ? '' : `${peer.name} declined the call.`
    if (call.status === 'Cancelled') return call.caller.key === meRef.current?.key ? '' : `${peer.name} cancelled the call.`
    if (call.status === 'Ended') return `The call with ${peer.name} ended.`
    return ''
  }, [])

  useEffect(() => {
    const socket = connectChatSocket()
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      setConnectProblem('')
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', (problem) => {
      setConnected(false)
      setConnectProblem(problem?.message === 'unauthorized' ? 'The call server did not accept your sign-in. Sign out and sign in again.' : 'The call server is not reachable. Start it with "npm start" in the FYP_CHAT folder.')
    })

    socket.on('calls:ready', ({ me: self }) => setMe(self))
    socket.on('presence:snapshot', (keys) => setOnline(new Set(keys)))
    socket.on('presence', ({ key, online: isOnline }) =>
      setOnline((now) => {
        const next = new Set(now)
        if (isOnline) next.add(key)
        else next.delete(key)
        return next
      }),
    )
    socket.on('calls:changed', () => setTick((value) => value + 1))

    socket.on('call:incoming', (call) => {
      // Already in a call: the server would not have allowed it, but never show two at once.
      if (currentRef.current) return
      setIncoming(call)
    })
    socket.on('call:accepted', (call) => {
      setIncoming(null)
      const media = createCallMedia()
      mediaRef.current = media
      media.start({ call, isCaller: call.caller.key === meRef.current?.key, sendSignal: (data) => socket.emit('call:signal', { callId: call.callId, data }, () => {}) })
      setCurrent({ call, muted: false, cameraOff: false, startedAt: Date.now() })
    })
    socket.on('call:ended', (call) => finish(call, describeEnd(call)))
    socket.on('call:signal', ({ data }) => mediaRef.current?.handleSignal(data))

    return () => {
      socket.close()
      mediaRef.current?.stop()
    }
  }, [finish, describeEnd])

  const emit = useCallback(
    (event, payload) =>
      new Promise((resolve) => {
        const socket = socketRef.current
        if (!socket?.connected) {
          resolve({ ok: false, error: 'The call server is not connected. Try again in a moment.' })
          return
        }
        socket.timeout(10000).emit(event, payload, (timeout, result) => resolve(timeout ? { ok: false, error: 'The call server did not answer.' } : result))
      }),
    [],
  )

  /** Starts a call to a contact ({ type, id }) as 'audio' or 'video'. Resolves to an error text, or '' when it is ringing. */
  const startCall = useCallback(
    async (contact, media) => {
      if (currentRef.current || incoming) return 'Finish your current call first.'
      try {
        const call = await callsApi.start(contact.type, contact.id, media)
        const result = await emit('call:invite', { callId: call.callId })
        if (!result.ok) return result.error
        setCurrent({ call, muted: false, cameraOff: false, startedAt: null })
        return ''
      } catch (problem) {
        return problem.message
      }
    },
    [emit, incoming],
  )

  const answer = useCallback(
    async (accept) => {
      const call = incoming
      if (!call) return
      const result = await emit('call:answer', { callId: call.callId, accept })
      if (!result.ok) {
        setIncoming(null)
        setNotice(result.error)
      } else if (!accept) {
        setIncoming(null)
      }
    },
    [emit, incoming],
  )

  const hangUp = useCallback(async () => {
    const call = currentRef.current?.call
    if (!call) return
    const result = await emit('call:end', { callId: call.callId })
    if (!result.ok) finish(call, result.error)
  }, [emit, finish])

  /** Manager only: cut any call of their employees or organizations. Resolves to an error text, or ''. */
  const cut = useCallback(async (callId, reason) => (await emit('call:cut', { callId, reason })).error ?? '', [emit])

  const toggle = useCallback((key) => {
    setCurrent((now) => {
      if (!now) return now
      const next = { ...now, [key]: !now[key] }
      if (key === 'muted') mediaRef.current?.setMuted(next.muted)
      else mediaRef.current?.setCameraOff(next.cameraOff)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({
      me,
      connected,
      connectProblem,
      isOnline: (key) => online.has(key),
      incoming,
      current,
      notice,
      tick,
      startCall,
      answer,
      hangUp,
      cut,
      toggle,
      clearNotice: () => setNotice(''),
    }),
    [me, connected, connectProblem, online, incoming, current, notice, tick, startCall, answer, hangUp, cut, toggle],
  )

  return (
    <CallContext.Provider value={value}>
      {children}
      <CallOverlay peerOf={(call) => peerOf(call, me)} />
    </CallContext.Provider>
  )
}

export default CallProvider
