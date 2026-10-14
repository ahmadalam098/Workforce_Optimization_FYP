import { useState } from 'react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import Alert from './Alert.jsx'

/**
 * Confirmation prompt for risky actions. `onConfirm` may be async; if it throws,
 * the error message is shown inside the dialog and the dialog stays open.
 */
function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    setBusy(true)
    setError('')
    try {
      await onConfirm()
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} loading={busy} className={danger ? 'btn--danger' : ''}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>{message}</p>
      {error && (
        <div style={{ marginTop: '1rem' }}>
          <Alert type="error">{error}</Alert>
        </div>
      )}
    </Modal>
  )
}

export default ConfirmDialog
