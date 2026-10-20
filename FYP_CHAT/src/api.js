import { Agent } from 'undici'
import { config } from './config.js'

// The ASP.NET development certificate is self-signed; only accepted when API_INSECURE_TLS=true.
const dispatcher = config.insecureTls ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function call(path, { method = 'GET', headers = {}, body } = {}) {
  let response
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      dispatcher,
    })
  } catch {
    throw new ApiError('The server is not reachable right now. Please try again.', 503)
  }

  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!response.ok) {
    const message = data?.message || data?.errors?.body?.[0] || data?.errors?.Body?.[0] || 'The request could not be completed.'
    throw new ApiError(message, response.status)
  }
  return data
}

/** What a manager's browser may do: the manager's own cookie is forwarded, so the API decides what is allowed. */
export const asManager = (token) => {
  const headers = { Cookie: `accessToken=${token}` }
  return {
    send: (orgId, body) => call(`/api/manager/chat/conversations/${orgId}/messages`, { method: 'POST', headers, body: { body } }),
    markRead: (orgId) => call(`/api/manager/chat/conversations/${orgId}/read`, { method: 'POST', headers }),
  }
}

/** What a signed-in organization's browser may do: its own cookie is forwarded, so the API decides which managers it can talk to. */
export const asSignedInOrganization = (token) => {
  const headers = { Cookie: `accessToken=${token}` }
  return {
    send: (managerUserId, body) => call(`/api/organization/chat/conversations/${managerUserId}/messages`, { method: 'POST', headers, body: { body } }),
    markRead: (managerUserId) => call(`/api/organization/chat/conversations/${managerUserId}/read`, { method: 'POST', headers }),
  }
}

/** What the organization side may do in the test page. Uses the shared service key; the chat server decides which organization the socket speaks for. */
export const asOrganization = (orgId, managerUserId) => {
  const headers = { 'X-Chat-Key': config.serviceKey }
  const base = `/api/internal/chat/organizations/${orgId}/managers/${managerUserId}`
  return {
    send: (body) => call(`${base}/messages`, { method: 'POST', headers, body: { body } }),
    markRead: () => call(`${base}/read`, { method: 'POST', headers }),
    history: (before) => call(`${base}/messages${before ? `?before=${before}` : ''}`, { headers }),
  }
}

export const internalOrganizations = () => call('/api/internal/chat/organizations', { headers: { 'X-Chat-Key': config.serviceKey } })

/** What a signed-in person's browser may do with calls: their own cookie is forwarded, so the API decides who may call whom. */
export const asUser = (token) => {
  const headers = { Cookie: `accessToken=${token}` }
  return {
    getCall: (callId) => call(`/api/calls/${callId}`, { headers }),
    answer: (callId, accept) => call(`/api/calls/${callId}/answer?accept=${accept ? 'true' : 'false'}`, { method: 'POST', headers }),
    end: (callId) => call(`/api/calls/${callId}/end`, { method: 'POST', headers }),
    monitor: () => call('/api/manager/calls/monitor', { headers }),
    cut: (callId, reason) => call(`/api/manager/calls/${callId}/cut`, { method: 'POST', headers, body: { reason } }),
  }
}

/** The call rang for too long (shared service key). */
export const markCallMissed = (callId) => call(`/api/internal/calls/${callId}/missed`, { method: 'POST', headers: { 'X-Chat-Key': config.serviceKey } })
