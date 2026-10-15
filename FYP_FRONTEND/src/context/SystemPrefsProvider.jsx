import { useCallback, useEffect, useMemo, useState } from 'react'
import { settingsApi } from '../services/admin/adminService.js'
import { setDisplayPrefs } from '../utils/format.js'
import { SystemPrefsContext } from './systemPrefsContext.js'

/**
 * Loads the General settings once for the admin portal: timezone, date and time format and language. `refresh()` loads them again after they are changed in Settings.
 * `version` changes every time so pages can show dates in the new style.
 */
export function SystemPrefsProvider({ children }) {
  const [state, setState] = useState({ ready: false, version: 0 })

  const refresh = useCallback(async () => {
    let settings = []
    try {
      settings = await settingsApi.list()
    } catch {
      // The portal still works with the built-in look when the settings cannot be read.
    }
    const value = (key) => settings.find((setting) => setting.key === key)?.value
    setDisplayPrefs({
      timezone: value('TIMEZONE') ?? 'auto',
      dateFormat: value('DATE_FORMAT') ?? 'dmy-short',
      timeFormat: value('TIME_FORMAT') ?? '12h',
      language: value('LANGUAGE') ?? 'en-GB',
    })
    setState((current) => ({ ready: true, version: current.version + 1 }))
  }, [])

  useEffect(() => {
    const timer = setTimeout(refresh, 0)
    return () => clearTimeout(timer)
  }, [refresh])

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh])
  return <SystemPrefsContext.Provider value={value}>{children}</SystemPrefsContext.Provider>
}
