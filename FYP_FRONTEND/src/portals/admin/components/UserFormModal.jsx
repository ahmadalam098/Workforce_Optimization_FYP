import { useCallback, useState } from 'react'
import PhotoPicker from '../../../components/PhotoPicker.jsx'
import ProfilePhotoEditor from '../../../components/ProfilePhotoEditor.jsx'
import { useAuth } from '../../../context/useAuth.js'
import { saveNewPersonPicture } from '../../../services/profileService.js'
import { squareJpeg } from '../../../utils/image.js'
import Modal from '../../../components/ui/Modal.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { managersApi, usersApi } from '../../../services/adminService.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { validatePerson } from '../../../utils/personValidation.js'
import PersonFields from './PersonFields.jsx'
import OrganizationPicker, { MAX_MANAGER_ORGANIZATIONS } from './OrganizationPicker.jsx'

function toInitialForm(user) {
  return {
    fullName: user?.fullName ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    cnic: user?.cnic ?? '',
    age: user?.age ?? '',
    country: user?.country ?? '',
    password: '',
  }
}

/**
 * Create (no `user`) or edit an Admin, Business Owner or Organization Manager.
 * `kind` is the role name: 'Admin' | 'Business Owner' | 'Organization Manager'.
 */
function UserFormModal({ kind, user, organizations, onClose, onSaved, onPictureChanged }) {
  const isEdit = Boolean(user)
  const isManager = kind === 'Organization Manager'
  const validate = useCallback((values) => validatePerson(values, { isEdit }), [isEdit])
  const { form, errors, field, checkAll, addServerErrors } = useFormFields(toInitialForm(user), validate)
  const [organizationIds, setOrganizationIds] = useState([])
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [photo, setPhoto] = useState(null)
  const { user: currentUser, setPictureVersion } = useAuth()

  // The picture is saved straight away (it does not wait for Save changes).
  function handlePictureChanged(version) {
    if (currentUser?.userId === user.userId) setPictureVersion(version)
    onPictureChanged?.(version)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }

    const payload = {
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      cnic: form.cnic.trim(),
      country: form.country.trim(),
      age: form.age === '' ? undefined : Number(form.age),
    }

    setSubmitting(true)
    setServerError('')
    try {
      if (isEdit) {
        await usersApi.update(user.userId, payload)
        onSaved(`${kind} updated successfully.`)
      } else if (isManager) {
        const created = await managersApi.create({ ...payload, password: form.password, roleType: kind, organizationIds })
        const photoProblem = await saveNewPersonPicture(created?.userId, photo, squareJpeg)
        onSaved(photoProblem ? `Organization manager created, but the picture was not saved: ${photoProblem}` : created?.message || 'Organization manager created successfully.')
      } else {
        const created = await usersApi.create({ ...payload, password: form.password, roleType: kind })
        const photoProblem = await saveNewPersonPicture(created?.userId, photo, squareJpeg)
        onSaved(photoProblem ? `${kind} account created, but the picture was not saved: ${photoProblem}` : created?.message || `${kind} account created successfully.`)
      }
    } catch (error) {
      addServerErrors(error.fieldErrors)
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${kind.toLowerCase()}` : `Add ${kind.toLowerCase()}`}
      subtitle={isEdit ? 'Update the account details.' : 'Create a login account for this role.'}
      size="lg"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={submitting}>
            {isEdit ? 'Save changes' : `Create ${kind.toLowerCase()}`}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}

        {!isEdit && <PhotoPicker file={photo} name={form.fullName} onChange={setPhoto} />}
        {isEdit && (
          <ProfilePhotoEditor userId={user.userId} name={form.fullName} onChanged={handlePictureChanged} />
        )}

        <div className="form-grid">
          <PersonFields field={field} isEdit={isEdit} passwordHint="At least 8 characters with a letter and a number. Share it securely." />
        </div>

        {isManager && !isEdit && (
          <OrganizationPicker
            organizations={organizations}
            selectedIds={organizationIds}
            onChange={setOrganizationIds}
            error={errors.organizationIds}
            hint={`Optional. A manager can handle up to ${MAX_MANAGER_ORGANIZATIONS} organizations.`}
          />
        )}
      </form>
    </Modal>
  )
}

export default UserFormModal
