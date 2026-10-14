import { createContext } from 'react'

// Shared auth state: { user, isAuthenticated, login, logout, sessionMessage, clearSessionMessage }
export const AuthContext = createContext(null)
