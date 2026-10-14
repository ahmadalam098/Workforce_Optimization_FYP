import { API_BASE_URL } from '../config/env.js'

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }

  /** Field-level validation errors from the backend: { fieldName: 'message' } */
  get fieldErrors() {
    const errors = this.data && typeof this.data === 'object' ? this.data.errors : null
    if (!errors || typeof errors !== 'object') return {}
    return Object.fromEntries(
      Object.entries(errors).map(([field, messages]) => [
        field.charAt(0).toLowerCase() + field.slice(1),
        Array.isArray(messages) ? messages[0] : String(messages),
      ]),
    )
  }
}

const NETWORK_ERROR_MESSAGE =
  'Unable to reach the server. Please make sure the backend is running and try again.'

// Called when an authenticated request returns 401 (expired or missing session).
let unauthorizedHandler = null
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

async function parseBody(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function extractMessage(data, status) {
  if (data && typeof data === 'object') {
    if (data.message) return data.message
    if (status < 500 && data.title) return data.title
  }
  if (status === 403) return 'You do not have permission to do this.'
  if (status === 404) return 'The requested item was not found.'
  if (status >= 500) return 'Something went wrong on the server. Please try again later.'
  if (typeof data === 'string' && data.trim() && data.length < 300) return data
  return 'Request failed. Please try again.'
}

function buildQuery(params) {
  if (!params) return ''
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.append(key, value)
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

/**
 * Small fetch wrapper: JSON in/out, sends the auth cookie, normalizes errors.
 * Use `auth: false` for public endpoints (login, forgot password) so a 401 there
 * is shown as a form error instead of ending the session.
 */
/** Fired after every successful change (POST/PUT/PATCH/DELETE) so screens such as the notification bell can refresh at once. */
export const DATA_CHANGED_EVENT = 'wfn:data-changed'

export async function apiRequest(path, { method = 'GET', body, params, auth = true, signal } = {}) {
  let response
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  try {
    response = await fetch(`${API_BASE_URL}${path}${buildQuery(params)}`, {
      method,
      credentials: 'include',
      // A FormData body (file upload) is sent as is; the browser sets its own content type.
      headers: body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? (isForm ? body : JSON.stringify(body)) : undefined,
      signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0, null)
  }

  const data = await parseBody(response)

  if (!response.ok) {
    if (response.status === 401 && auth && unauthorizedHandler) unauthorizedHandler()
    throw new ApiError(extractMessage(data, response.status), response.status, data)
  }

  if (method !== 'GET' && typeof window !== 'undefined') window.dispatchEvent(new Event(DATA_CHANGED_EVENT))

  return data
}
