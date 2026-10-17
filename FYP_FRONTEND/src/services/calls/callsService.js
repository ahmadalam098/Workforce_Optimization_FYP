import { apiRequest } from '../apiClient.js'

// Audio / video calls between an employee, an organization and an organization manager. The API decides who may call whom and keeps the
// call session; the live part (ringing, answering, ending, the manager cutting a call, who is online) goes through the chat server.

export const callsApi = {
  /** The people I may call: [{ type ('Employee' | 'Manager' | 'Organization'), id, key, name, subtitle }] */
  contacts: (signal) => apiRequest('/api/calls/contacts', { signal }),
  /** My latest calls: [{ callId, media, status, caller: { type, id, key, name }, callee, createdAt, answeredAt, endedAt, endedByType, endReason }] */
  history: (signal) => apiRequest('/api/calls/history', { signal }),
  /** media: 'audio' | 'video'. Creates a ringing call (then the page sends it with the socket event call:invite). */
  start: (targetType, targetId, media) => apiRequest('/api/calls', { method: 'POST', body: { targetType, targetId, media } }),
}

export const managerCallsApi = {
  /** { live: [call], recent: [call] } - the calls of the manager's employees and organizations */
  monitor: (signal) => apiRequest('/api/manager/calls/monitor', { signal }),
}
