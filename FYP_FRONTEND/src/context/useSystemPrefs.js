import { useContext } from 'react'
import { SystemPrefsContext } from './systemPrefsContext.js'

export function useSystemPrefs() {
  return useContext(SystemPrefsContext)
}
