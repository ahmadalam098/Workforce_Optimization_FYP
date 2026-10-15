import { useEffect } from 'react'
import Alert from '../../../components/ui/Alert.jsx'

/** Success message that dismisses itself after a few seconds. */
function Notice({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [message, onClose])

  if (!message) return null
  return (
    <Alert type="success" onClose={onClose}>
      {message}
    </Alert>
  )
}

export default Notice
