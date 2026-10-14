import { useState } from 'react'
import { useLocation } from 'react-router-dom'

/** Like useState('') for a page's success message, but starts with the message sent by the page we came from (after an "add"). */
export function useFlashNotice() {
  const location = useLocation()
  return useState(location.state?.message ?? '')
}
