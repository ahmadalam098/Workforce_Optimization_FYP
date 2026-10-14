import { useCallback, useEffect, useEffectEvent, useState } from 'react'

/**
 * Loads data with an AbortSignal and re-loads whenever `key` changes (or reload() is called).
 * `key` must be a string that describes the request, e.g. JSON.stringify(params).
 * Returns { data, error, loading, reload }. Old data is kept while a new request is loading.
 */
export function useFetch(fetcher, key) {
  const [state, setState] = useState({ requestKey: null, data: null, error: null })
  const [reloadCount, setReloadCount] = useState(0)
  const requestKey = `${key}#${reloadCount}`

  const run = useEffectEvent((signal) => fetcher(signal))

  useEffect(() => {
    const controller = new AbortController()
    run(controller.signal)
      .then((data) => setState({ requestKey, data, error: null }))
      .catch((error) => {
        if (error.name === 'AbortError') return
        setState((current) => ({ requestKey, data: current.data, error }))
      })
    return () => controller.abort()
  }, [requestKey])

  const loading = state.requestKey !== requestKey
  // Stable identity, so it can safely be used in effect dependencies (e.g. auto-refresh timers).
  const reload = useCallback(() => setReloadCount((count) => count + 1), [])

  return {
    data: state.data,
    error: loading ? null : state.error,
    loading,
    reload,
  }
}
