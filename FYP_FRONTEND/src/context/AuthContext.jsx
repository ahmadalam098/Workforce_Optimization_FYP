import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './authContext.js'
import * as authService from '../services/authService.js'
import * as organizationService from '../services/organization/organizationService.js'
import { setUnauthorizedHandler } from '../services/apiClient.js'
import { clearUser, loadUser, saveUser, updateStoredUser } from '../utils/userStorage.js'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => loadUser())
  // When a saved profile exists, confirm with the server that the cookie session is still valid.
  const [initializing, setInitializing] = useState(() => Boolean(loadUser()))
  const [sessionMessage, setSessionMessage] = useState('')

  const login = useCallback(async ({ email, password, roleName, remember }) => {
    const response = await authService.login({ email, password, roleName })
    const profile = response?.user
    if (!profile?.roleName) {
      throw new Error('Login response did not include user details. Please try again.')
    }
    saveUser(profile, remember)
    setUser(profile)
    setSessionMessage('')
    return profile
  }, [])

  // An organization signs in with its own email and password (no role to choose); the session works the same way.
  const loginOrganization = useCallback(async ({ email, password, remember }) => {
    const response = await organizationService.login({ email, password })
    const profile = response?.user
    if (!profile?.roleName) {
      throw new Error('Login response did not include the organization details. Please try again.')
    }
    saveUser(profile, remember)
    setUser(profile)
    setSessionMessage('')
    return profile
  }, [])

  // Remembers (for this tab) that the picture changed, so every copy of it reloads.
  const setPictureVersion = useCallback((pictureVersion) => setUser((current) => (current ? { ...current, pictureVersion } : current)), [])

  // The signed-in person changed their own name or email.
  const updateUser = useCallback((changes) => {
    setUser((current) => {
      if (!current) return current
      const next = { ...current, ...changes }
      updateStoredUser(next)
      return next
    })
  }, [])

  const endSession = useCallback((message = '') => {
    clearUser()
    setUser(null)
    setSessionMessage(message)
  }, [])

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } catch {
      // Even if the server cannot be reached, end the local session.
    }
    endSession()
  }, [endSession])

  useEffect(() => {
    setUnauthorizedHandler(() => endSession('Your session has expired. Please sign in again.'))
    return () => setUnauthorizedHandler(null)
  }, [endSession])

  useEffect(() => {
    if (!initializing) return undefined
    let cancelled = false
    authService
      .getCurrentUser()
      .then((response) => {
        if (cancelled) return
        if (response?.user) {
          setUser(response.user)
        } else {
          endSession()
        }
      })
      .catch((error) => {
        if (cancelled) return
        // 401 = the cookie is gone/expired. Network errors keep the saved profile so the page still opens.
        if (error.status === 401) endSession('Your session has expired. Please sign in again.')
      })
      .finally(() => {
        if (!cancelled) setInitializing(false)
      })
    return () => {
      cancelled = true
    }
  }, [initializing, endSession])

  const value = useMemo(
    () => ({
      user,
      initializing,
      isAuthenticated: Boolean(user),
      login,
      loginOrganization,
      logout,
      setPictureVersion,
      updateUser,
      sessionMessage,
      clearSessionMessage: () => setSessionMessage(''),
    }),
    [user, initializing, login, loginOrganization, logout, setPictureVersion, updateUser, sessionMessage],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
