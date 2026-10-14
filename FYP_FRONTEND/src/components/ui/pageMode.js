import { createContext, useContext } from 'react'

// When true, a form written as a dialog (<Modal>) is drawn as a normal page section instead of a pop-up.
// The "add" screens use this: they open on their own page and go back to the list after saving.
export const PageModeContext = createContext(false)

export function usePageMode() {
  return useContext(PageModeContext)
}
