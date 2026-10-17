import { useEffect, useMemo } from 'react'
import { useCalls } from '../../../components/calls/callContext.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { managerCallsApi } from '../../../services/calls/callsService.js'

const seconds = (call) => (call.answeredAt && call.endedAt ? Math.max(0, Math.round((new Date(call.endedAt) - new Date(call.answeredAt)) / 1000)) : 0)

/** One call of the manager's employees / organizations as a monitored session (the shape is described in performanceSlots.js). */
function toSession(call) {
  const parties = [call.caller, call.callee]
  const employee = parties.find((party) => party.type === 'Employee')
  const organization = parties.find((party) => party.type === 'Organization')
  const other = parties.find((party) => party !== employee) ?? call.callee
  return {
    sessionId: call.callId,
    type: call.media,
    employeeId: employee?.id ?? null, // the employee's user id
    employeeName: employee?.name ?? call.caller.name,
    organizationId: organization?.id ?? null,
    organizationName: organization?.name ?? other.name,
    startedAt: call.createdAt,
    durationSeconds: seconds(call),
    mediaUrl: null, // nothing is recorded yet: no sound or picture in the calls
    transcript: [],
    score: null,
    sentiment: null,
    reviewNote: null,
    // what the call itself knows
    live: call.status === 'Ringing' || call.status === 'Active',
    status: call.status,
    endReason: call.endReason,
    caller: call.caller.name,
    callee: call.callee.name,
  }
}

/**
 * The monitored sessions: the audio and video calls of the manager's employees and organizations, live and finished (chats are not monitored yet).
 * The list refreshes when a call changes and every few seconds. The filters are applied here.
 * SLOT for later: recordings, transcripts and scores (mediaUrl, transcript, score, sentiment) come from the API when they exist.
 */
export function useMonitoredSessions(filters) {
  const { tick } = useCalls()
  const { data, error, loading, reload } = useFetch((signal) => managerCallsApi.monitor(signal), 'manager-performance-calls')

  useEffect(() => {
    if (tick > 0) reload()
  }, [tick, reload])
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) reload()
    }, 5000)
    return () => clearInterval(timer)
  }, [reload])

  const { employeeUserId, organizationId, type, from, to } = filters
  const sessions = useMemo(() => {
    const all = [...(data?.live ?? []), ...(data?.recent ?? [])].map(toSession)
    return all.filter((session) => {
      if (employeeUserId && String(session.employeeId) !== String(employeeUserId)) return false
      if (organizationId && String(session.organizationId) !== String(organizationId)) return false
      if (type && session.type !== type) return false
      const day = String(session.startedAt).slice(0, 10)
      if (from && day < from) return false
      if (to && day > to) return false
      return true
    })
  }, [data, employeeUserId, organizationId, type, from, to])

  return { sessions, loading, error: error ? error.message ?? String(error) : '', reload }
}
