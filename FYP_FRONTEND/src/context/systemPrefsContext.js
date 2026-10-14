import { createContext } from 'react'

/** { ready, version, refresh } - the date and time style chosen in Settings > General. */
export const SystemPrefsContext = createContext({ ready: true, version: 0, refresh: () => {} })
