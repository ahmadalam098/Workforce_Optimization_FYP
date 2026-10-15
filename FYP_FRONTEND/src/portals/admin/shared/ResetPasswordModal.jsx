import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { onLeave } from '../../../utils/onLeave.js'
import { validateConfirmPassword, validateNewPassword } from '../../../utils/validators.js'

/** Lets an admin set a new password. `onSubmit(newPassword)` calls the right API. */
function ResetPasswordModal({ name, onSubmit, onClose, onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    const problem = validateNewPassword(password)
    const confirmProblem = validateConfirmPassword(password, confirm)
    setError(problem)
    setConfirmError(confirmProblem)
    if (problem || confirmProblem) return

    setSubmitting(true)
    setServerError('')
    try {
      await onSubmit(password)
      onDone(`Password reset for ${name}.`)
    } catch (err) {
      setServerError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Reset password"
      subtitle={`Set a new password for ${name}.`}
      size="sm"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="reset-password-form" loading={submitting}>
            Reset password
          </Button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <TextField
          label="New password"
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            if (error) setError('')
          }}
          required
          maxLength={100}
          onBlur={onLeave(() => setError(validateNewPassword(password)))}
          error={error}
          hint="At least 8 characters with a letter and a number, no spaces."
          autoComplete="new-password"
        />
        <TextField
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value)
            if (confirmError) setConfirmError('')
          }}
          required
          maxLength={100}
          onBlur={onLeave(() => setConfirmError(validateConfirmPassword(password, confirm)))}
          error={confirmError}
          autoComplete="new-password"
        />
      </form>
    </Modal>
  )
}

export default ResetPasswordModal
