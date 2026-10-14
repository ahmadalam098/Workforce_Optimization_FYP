import { useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../../components/ui/Button.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Icon from '../../../components/ui/Icon.jsx'

/**
 * "Delete completely" for something that is already deactivated: a trash button plus a confirmation.
 * Render it only for deactivated items. `onDelete()` calls the API and may throw; the reason (for example the records that must
 * be kept) is then shown in the dialog. `onDone(message)` runs after the delete worked.
 * look: 'icon' (a row button) | 'button' (a labelled button for a details page).
 */
function DeleteForever({ name, title, message, onDelete, onDone, look = 'icon' }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {look === 'button' ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Icon name="trash" size={17} /> Delete
        </Button>
      ) : (
        <button type="button" className="icon-btn icon-btn--danger" onClick={() => setOpen(true)} aria-label={`Delete ${name} completely`} title="Delete completely">
          <Icon name="trash" size={17} />
        </button>
      )}

      {/* Shown on the page itself, not inside the table row: a deactivated row is drawn faded, and the dialog would fade with it. */}
      {open &&
        createPortal(
        <ConfirmDialog
          title={title}
          message={message}
          confirmLabel="Delete completely"
          danger
          onConfirm={async () => {
            const result = await onDelete()
            setOpen(false)
            onDone(result?.message || `${name} was deleted.`)
          }}
          onCancel={() => setOpen(false)}
        />,
        document.body,
      )}
    </>
  )
}

export default DeleteForever
