import { useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { PROFICIENCY_OPTIONS } from '../../../constants/employee.js'
import { employeeExtrasApi } from '../../../services/adminService.js'
import { validateChoice, validateInteger } from '../../../utils/validators.js'

/**
 * Add a skill to an employee (no `skill`) or edit the level of an existing one.
 * `catalog` is the list of active skills, `ownedIds` the skill ids the employee already has.
 */
function EmployeeSkillModal({ employeeId, skill, catalog, ownedIds, onClose, onSaved }) {
  const isEdit = Boolean(skill)
  const [skillId, setSkillId] = useState(isEdit ? String(skill.skillId) : '')
  const [proficiency, setProficiency] = useState(skill?.efficiencyLevel ?? 'Intermediate')
  const [years, setYears] = useState(skill?.yearsOfExperience ?? '')
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const options = catalog
    .filter((item) => !ownedIds.includes(item.skillId))
    .map((item) => ({ value: String(item.skillId), label: item.category ? `${item.name} (${item.category})` : item.name }))

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!isEdit) {
      const skillError = validateChoice(skillId, options, 'Skill')
      if (skillError) nextErrors.skillId = skillError
    }
    const levelError = validateChoice(proficiency, PROFICIENCY_OPTIONS, 'Proficiency')
    if (levelError) nextErrors.proficiency = levelError
    const yearsError = validateInteger(years, { label: 'Years of experience', required: false, min: 0, max: 60 })
    if (yearsError) nextErrors.yearsOfExperience = yearsError
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const body = { proficiency, yearsOfExperience: years === '' ? undefined : Number(years) }

    setSubmitting(true)
    setServerError('')
    try {
      if (isEdit) {
        await employeeExtrasApi.updateSkill(employeeId, skill.skillId, body)
        onSaved(`${skill.skillName} updated.`)
      } else {
        await employeeExtrasApi.addSkill(employeeId, { ...body, skillId: Number(skillId) })
        onSaved('Skill added.')
      }
    } catch (error) {
      setErrors((current) => ({ ...current, ...error.fieldErrors }))
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${skill.skillName}` : 'Add skill'}
      size="sm"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="employee-skill-form" loading={submitting}>
            {isEdit ? 'Save' : 'Add skill'}
          </Button>
        </>
      }
    >
      <form id="employee-skill-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}

        {!isEdit && (
          <SelectField
            label="Skill"
            required
            value={skillId}
            onChange={(event) => {
              setSkillId(event.target.value)
              setErrors((current) => ({ ...current, skillId: '' }))
            }}
            options={options}
            placeholder="Select a skill"
            error={errors.skillId}
            hint={
              options.length === 0 ? (
                <>
                  No more skills to add. <Link to="/admin/skills">Add skills to the catalog</Link>.
                </>
              ) : undefined
            }
          />
        )}

        <SelectField label="Proficiency" required value={proficiency} onChange={(event) => { setProficiency(event.target.value); setErrors((current) => ({ ...current, proficiency: '' })) }} options={PROFICIENCY_OPTIONS} error={errors.proficiency} />
        <TextField label="Years of experience (optional)" type="number" inputMode="numeric" min="0" max="60" step="1" value={years} onChange={(event) => { setYears(event.target.value); setErrors((current) => ({ ...current, yearsOfExperience: '' })) }} error={errors.yearsOfExperience} />
      </form>
    </Modal>
  )
}

export default EmployeeSkillModal
