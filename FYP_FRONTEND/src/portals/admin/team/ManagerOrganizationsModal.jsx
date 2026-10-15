import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { managersApi } from '../../../services/admin/adminService.js'
import OrganizationPicker from '../organizations/OrganizationPicker.jsx'

/** Change which organizations a manager handles (one or more). */
function ManagerOrganizationsModal({ manager, organizations, onClose, onSaved }) {
  const [selectedIds, setSelectedIds] = useState(() =>
    manager.organizations.map((assignment) => assignment.organizationId).filter(Boolean),
  )
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSave() {
    setSubmitting(true)
    setError('')
    try {
      await managersApi.setOrganizations(manager.userId, selectedIds)
      onSaved(`Organizations updated for ${manager.fullName}.`)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Assigned organizations"
      subtitle={`Choose the organizations ${manager.fullName} will handle.`}
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={submitting}>
            Save assignments
          </Button>
        </>
      }
    >
      <div className="form-stack">
        {error && <Alert type="error">{error}</Alert>}
        <OrganizationPicker organizations={organizations} selectedIds={selectedIds} onChange={setSelectedIds} />
      </div>
    </Modal>
  )
}

export default ManagerOrganizationsModal
