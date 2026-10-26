import { useCallback, useState } from 'react'
import PhotoPicker from '../../../components/profile/PhotoPicker.jsx'
import ProfilePhotoEditor from '../../../components/profile/ProfilePhotoEditor.jsx'
import { useAuth } from '../../../context/useAuth.js'
import { saveNewPersonPicture } from '../../../services/profileService.js'
import { squareJpeg } from '../../../utils/image.js'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { employeesApi, shiftsApi, skillsApi } from '../../../services/admin/adminService.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { formatTimeRange } from '../../../utils/contractFormat.js'
import EmployeeSkillsEditor from './EmployeeSkillsEditor.jsx'
import { AVAILABILITY_OPTIONS } from '../../../constants/employee.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { validatePerson, validateSkillList } from '../../../utils/personValidation.js'
import { onlyErrors, validateChoice, validateDate } from '../../../utils/validators.js'
import PersonFields from './PersonFields.jsx'

function toInitialForm(employee) {
  return {
    fullName: employee?.fullName ?? '',
    email: employee?.email ?? '',
    phone: employee?.phone ?? '',
    cnic: employee?.cnic ?? '',
    age: employee?.age ?? '',
    country: employee?.country ?? '',
    password: '',
    organizationId: employee?.organizationId ?? '',
    joiningDate: employee?.joiningDate ?? '',
    availabilityStatus: employee?.availabilityStatus ?? 'Available',
    shiftId: employee?.currentShift?.shiftId ? String(employee.currentShift.shiftId) : '',
    skills: (employee?.skillDetails ?? []).map((skill) => ({
      skillId: skill.skillId,
      skillName: skill.skillName,
      proficiency: skill.efficiencyLevel,
      yearsOfExperience: skill.yearsOfExperience ?? '',
    })),
  }
}

function validateEmployee(form, isEdit) {
  return {
    ...validatePerson(form, { isEdit }),
    ...onlyErrors({
      availabilityStatus: validateChoice(form.availabilityStatus, AVAILABILITY_OPTIONS, 'Availability'),
      joiningDate: validateDate(form.joiningDate, { label: 'Joining date', required: false }),
      skills: validateSkillList(form.skills),
    }),
  }
}

/** Create (no `employee`) or edit an employee. Calls onSaved(message) after success. */
function EmployeeFormModal({ employee, organizations, onClose, onSaved, onPictureChanged }) {
  const isEdit = Boolean(employee)
  const validate = useCallback((values) => validateEmployee(values, isEdit), [isEdit])
  const { form, errors, field, setValue, checkAll, addServerErrors } = useFormFields(toInitialForm(employee), validate)
  const { data: skillCatalog } = useFetch((signal) => skillsApi.lookup(signal), 'skills-lookup')
  const { data: shifts } = useFetch((signal) => shiftsApi.list(signal), 'shifts-list')
  const shiftOptions = (shifts ?? []).map((shift) => ({ value: String(shift.shiftId), label: `${shift.name} (${formatTimeRange(shift.startTime, shift.endTime)})` }))
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [photo, setPhoto] = useState(null)
  const { user: currentUser, setPictureVersion } = useAuth()

  // The picture is saved straight away (it does not wait for Save changes).
  function handlePictureChanged(version) {
    if (currentUser?.userId === employee.userId) setPictureVersion(version)
    onPictureChanged?.(version)
  }

  const organizationOptions = organizations.map((org) => ({ value: String(org.organizationId), label: org.name || `Organization #${org.organizationId}` }))

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
      joiningDate: form.joiningDate || undefined,
      availabilityStatus: form.availabilityStatus,
      skills: form.skills.map((skill) => ({
        skillId: skill.skillId,
        proficiency: skill.proficiency,
        yearsOfExperience: skill.yearsOfExperience === '' ? undefined : Number(skill.yearsOfExperience),
      })),
      shiftId: form.shiftId ? Number(form.shiftId) : undefined,
    }

    setSubmitting(true)
    setServerError('')
    try {
      if (isEdit) {
        if (form.organizationId === '') {
          if (employee.organizationId) payload.clearOrganization = true
        } else {
          payload.organizationId = Number(form.organizationId)
        }
        if (!form.shiftId && employee.currentShift) payload.clearShift = true
        const updated = await employeesApi.update(employee.employeeId, payload)
        onSaved(updated?.message || 'Employee updated successfully.')
      } else {
        payload.password = form.password
        if (form.organizationId !== '') payload.organizationId = Number(form.organizationId)
        const created = await employeesApi.create(payload)
        const photoProblem = await saveNewPersonPicture(created?.userId, photo, squareJpeg)
        onSaved(photoProblem ? `Employee created, but the picture was not saved: ${photoProblem}` : created?.message || 'Employee created successfully.')
      }
    } catch (error) {
      addServerErrors(error.fieldErrors)
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={isEdit ? 'Edit employee' : 'Add employee'}
      subtitle={isEdit ? 'Update the profile, shift and skills. The employee is emailed what changed.' : 'Create the login account, shift and skills in one go. The employee is emailed.'}
      size="lg"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="employee-form" loading={submitting}>
            {isEdit ? 'Save changes' : 'Create employee'}
          </Button>
        </>
      }
    >
      <form id="employee-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}

        {!isEdit && <PhotoPicker file={photo} name={form.fullName} onChange={setPhoto} />}
        {isEdit && (
          <ProfilePhotoEditor userId={employee.userId} name={form.fullName} onChanged={handlePictureChanged} />
        )}

        <div className="form-grid">
          <PersonFields field={field} isEdit={isEdit} passwordHint="At least 8 characters with a letter and a number. Share it with the employee securely." />

          <SelectField label="Organization" options={organizationOptions} placeholder="Unassigned (central pool)" {...field('organizationId')} />
          <SelectField label="Availability" required options={AVAILABILITY_OPTIONS} {...field('availabilityStatus')} />
          <TextField label="Joining date" type="date" min="1960-01-01" max="2100-12-31" {...field('joiningDate')} />
          <SelectField label="Shift" options={shiftOptions} placeholder="No shift" hint={shifts && shifts.length === 0 ? 'No shifts exist yet. Add one on the Shifts page.' : undefined} {...field('shiftId')} />
          <EmployeeSkillsEditor value={form.skills} onChange={(next) => setValue('skills', next)} catalog={skillCatalog} error={errors.skills} />
        </div>
      </form>
    </Modal>
  )
}

export default EmployeeFormModal
