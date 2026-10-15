import { useMemo } from 'react'

/**
 * The monitored sessions (audio calls, video calls, chats between an employee and an organization).
 *
 * SLOT: nothing is recorded yet, so this returns an empty list. When the communication exists, call the API here (see performanceSlots.js
 * for the shape of a session) and keep the same return value; the page does not need to change.
 */
export function useMonitoredSessions(filters) {
  return useMemo(() => {
    void filters // the filters will be sent to the API later
    return { sessions: [], loading: false, error: '' }
  }, [filters])
}
