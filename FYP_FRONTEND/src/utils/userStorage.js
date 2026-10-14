// Stores only the public profile returned by the login API (no token, no password).
// The real credential is the HttpOnly cookie set by the backend.
const KEY = 'wfn.user'

function safe(fn, fallback = null) {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export function clearUser() {
  safe(() => {
    window.sessionStorage.removeItem(KEY)
    window.localStorage.removeItem(KEY)
  })
}

export function saveUser(user, remember) {
  safe(() => {
    clearUser()
    const store = remember ? window.localStorage : window.sessionStorage
    store.setItem(KEY, JSON.stringify(user))
  })
}

export function loadUser() {
  return safe(() => {
    const raw = window.sessionStorage.getItem(KEY) || window.localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  })
}

/** Replaces the saved profile in whichever place it is kept (this tab only, or remembered). */
export function updateStoredUser(user) {
  safe(() => {
    const store = window.localStorage.getItem(KEY) ? window.localStorage : window.sessionStorage
    store.setItem(KEY, JSON.stringify(user))
  })
}
