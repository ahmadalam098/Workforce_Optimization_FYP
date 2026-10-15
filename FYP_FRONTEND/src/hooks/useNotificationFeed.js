import { useCallback, useEffect, useRef, useState } from 'react'
import { notificationsApi } from '../services/admin/adminService.js'
import { DATA_CHANGED_EVENT } from '../services/apiClient.js'

const POLL_MS = 20000
const FEED_SIZE = 20

/**
 * The notification feed for the bell. It refreshes
 *  - right after anything is changed anywhere in the portal (a form is saved, a request is approved ...),
 *  - when the browser tab is focused again, and
 *  - every 20 seconds while the tab is visible (so actions by other people also show up).
 * `api` is { feed(limit), readAll() }: the admin one by default, the manager one in the manager portal.
 */
export function useNotificationFeed(api = notificationsApi) {
  const [feed, setFeed] = useState(null)
  const [error, setError] = useState('')
  const mounted = useRef(true)

  const load = useCallback(async () => {
    try {
      const data = await api.feed(FEED_SIZE)
      if (!mounted.current) return
      setFeed(data)
      setError('')
    } catch (err) {
      if (mounted.current && err.name !== 'AbortError') setError(err.message)
    }
  }, [api])

  useEffect(() => {
    mounted.current = true
    let debounce
    const soon = () => {
      clearTimeout(debounce)
      debounce = setTimeout(load, 350)
    }
    const poll = setInterval(() => {
      if (!document.hidden) load()
    }, POLL_MS)

    const first = setTimeout(load, 0)
    window.addEventListener(DATA_CHANGED_EVENT, soon)
    window.addEventListener('focus', soon)

    return () => {
      mounted.current = false
      clearTimeout(first)
      clearTimeout(debounce)
      clearInterval(poll)
      window.removeEventListener(DATA_CHANGED_EVENT, soon)
      window.removeEventListener('focus', soon)
    }
  }, [load])

  const markAllRead = useCallback(async () => {
    try {
      await api.readAll()
    } catch (err) {
      setError(err.message)
      return
    }
    await load()
  }, [api, load])

  return { feed, error, markAllRead, reload: load }
}
