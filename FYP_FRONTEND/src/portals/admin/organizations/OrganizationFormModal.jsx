import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import Checkbox from '../../../components/ui/Checkbox.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { organizationsApi } from '../../../services/admin/adminService.js'
import {
  cleanPhoneInput,
  onlyErrors,
  validateAddress,
  validateCountry,
  validateEmail,
  validateOrganizationName,
  validatePhone,
} from '../../../utils/validators.js'

function validateOrganization(form) {
  return onlyErrors({
    name: validateOrganizationName(form.name),
    email: validateEmail(form.email),
    phone: validatePhone(form.phone, { required: true }),
    country: validateCountry(form.country, { required: true }),
    address: validateAddress(form.address, { required: true }),
  })
}

/** Create (no `organization`) or edit an organization. */
function OrganizationFormModal({ organization, onClose, onSaved }) {
  const isEdit = Boolean(organization)
  const { form, field, checkAll, addServerErrors } = useFormFields(
    {
      name: organization?.name ?? '',
      email: organization?.email ?? '',
      phone: organization?.phone ?? '',
      country: organization?.country ?? '',
      address: organization?.address ?? '',
    },
    validateOrganization,
  )
  const [approveImmediately, setApproveImmediately] = useState(true)
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      country: form.country.trim(),
      address: form.address.trim(),
    }

    setSubmitting(true)
    setServerError('')
    try {
      if (isEdit) {
        const result = await organizationsApi.update(organization.organizationId, payload)
        onSaved(result?.message || 'Organization updated.')
      } else {
        const result = await organizationsApi.create({ ...payload, approveImmediately })
        onSaved(result?.message || 'Organization created.')
      }
    } catch (error) {
      addServerErrors(error.fieldErrors)
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={isEdit ? 'Edit organization' : 'Add organization'}
      subtitle={isEdit ? 'Update the organization details.' : 'Register a client organization.'}
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="organization-form" loading={submitting}>
            {isEdit ? 'Save changes' : 'Create organization'}
          </Button>
        </>
      }
    >
      <form id="organization-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}

        <div className="form-grid">
          <TextField label="Organization name" className="form-grid__full" required maxLength={150} autoComplete="off" {...field('name')} />
          <TextField label="Email address" type="email" required maxLength={150} autoComplete="off" hint="Confirmation and notification emails are sent here." {...field('email')} />
          <TextField label="Phone" type="tel" inputMode="tel" required maxLength={20} placeholder="+92 300 1234567" autoComplete="off" {...field('phone', { clean: cleanPhoneInput })} />
          <TextField label="Country" required maxLength={100} autoComplete="off" {...field('country')} />
          <TextField label="Address" required maxLength={255} autoComplete="off" {...field('address')} />
        </div>

        {!isEdit && (
          <Checkbox
            label="Mark as approved right away (otherwise it waits for approval)"
            checked={approveImmediately}
            onChange={setApproveImmediately}
          />
        )}
      </form>
    </Modal>
  )
}

export default OrganizationFormModal
