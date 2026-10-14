import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { onLeave } from '../../../utils/onLeave.js'
import { validateText } from '../../../utils/validators.js'

/**
 * Asks for a reason/response before approving, rejecting, suspending, etc.
 * `onSubmit(text)` runs the API call; errors are shown inside the dialog.
 */
function DecisionModal({ title, description, label = 'Reason', required = false, confirmLabel, danger = false, onSubmit, onClose }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    const problem = validateText(text, { label, required, min: required ? 5 : 3, max: 500 })
    if (problem) {
      setError(problem)
      return
    }

    setSubmitting(true)
    setServerError('')
    try {
      await onSubmit(text.trim())
    } catch (err) {
      setServerError(err.message)
      if (err.fieldErrors?.reason || err.fieldErrors?.response) setError(err.fieldErrors.reason || err.fieldErrors.response)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={title}
      subtitle={description}
      size="sm"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="decision-form" loading={submitting} className={danger ? 'btn--danger' : ''}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id="decision-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <TextArea
          label={required ? label : `${label} (optional)`}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            if (error) setError('')
          }}
          required={required}
          onBlur={onLeave(() => setError(validateText(text, { label, required, min: required ? 5 : 3, max: 500 })))}
          error={error}
          maxLength={500}
        />
      </form>
    </Modal>
  )
}

export default DecisionModal
