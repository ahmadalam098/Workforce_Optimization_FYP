import { createContext, useContext } from 'react'

export const CallContext = createContext(null)

/**
 * The calling state of the portal:
 * { me, connected, connectProblem, isOnline(key), incoming, current, notice, tick, startCall(contact, media), answer(accept), hangUp(), cut(callId, reason), clearNotice() }
 * `tick` changes whenever any call changes (for the manager's monitor screen).
 */
export function useCalls() {
  const value = useContext(CallContext)
  if (!value) throw new Error('useCalls must be used inside the portal layout (CallProvider).')
  return value
}
