import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { skillsApi } from '../../../services/adminService.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { onlyErrors, validateText } from '../../../utils/validators.js'

function validateSkill(form) {
  return onlyErrors({
    name: validateText(form.name, {
      label: 'Skill name',
      min: 2,
      max: 100,
      pattern: /^[\p{L}\p{N}][\p{L}\p{N}\s&+#./()-]*$/u,
      patternMessage: 'Skill name can only contain letters, numbers, spaces and & + # . / ( ) -',
    }),
    category: validateText(form.category, { label: 'Category', required: false, min: 2, max: 100 }),
    description: validateText(form.description, { label: 'Description', required: false, max: 255 }),
  })
}

/** Create (no `skill`) or edit a skill in the catalog. `categories` feeds the suggestion list. */
function SkillFormModal({ skill, categories, onClose, onSaved }) {
  const isEdit = Boolean(skill)
  const { form, field, checkAll, addServerErrors } = useFormFields(
    { name: skill?.name ?? '', category: skill?.category ?? '', description: skill?.description ?? '' },
    validateSkill,
  )
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }

    const payload = { name: form.name.trim(), category: form.category.trim(), description: form.description.trim() }

    setSubmitting(true)
    setServerError('')
    try {
      if (isEdit) {
        await skillsApi.update(skill.skillId, payload)
        onSaved('Skill updated.')
      } else {
        await skillsApi.create(payload)
        onSaved('Skill added to the catalog.')
      }
    } catch (error) {
      addServerErrors(error.fieldErrors)
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={isEdit ? 'Edit skill' : 'Add skill'}
      subtitle="Skills in the catalog can be given to employees and matched to workforce requests."
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="skill-form" loading={submitting}>
            {isEdit ? 'Save changes' : 'Add skill'}
          </Button>
        </>
      }
    >
      <form id="skill-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <TextField label="Skill name" required maxLength={100} {...field('name')} placeholder="e.g. German" autoComplete="off" />
        <TextField label="Category" {...field('category')} placeholder="e.g. Language" list="skill-categories" autoComplete="off" />
        <datalist id="skill-categories">
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
        <TextArea label="Description (optional)" {...field('description')} maxLength={255} />
      </form>
    </Modal>
  )
}

export default SkillFormModal
