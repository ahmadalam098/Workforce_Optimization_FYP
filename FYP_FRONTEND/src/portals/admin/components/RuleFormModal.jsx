import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Checkbox from '../../../components/ui/Checkbox.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { RULE_CATEGORIES } from '../../../constants/contracts.js'
import { contractsApi } from '../../../services/adminService.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { onlyErrors, validateChoice, validateText } from '../../../utils/validators.js'

function validateRule(form) {
  return onlyErrors({
    category: validateChoice(form.category, RULE_CATEGORIES, 'Category'),
    title: validateText(form.title, { label: 'Title', min: 3, max: 150 }),
    ruleValue: validateText(form.ruleValue, { label: 'Value', required: false, max: 255 }),
    description: validateText(form.description, { label: 'Description', required: false, max: 500 }),
  })
}

/** Add (no `rule`) or edit a rule of a contract. */
function RuleFormModal({ contractId, rule, onClose, onSaved }) {
  const isEdit = Boolean(rule)
  const { form, field, checkAll, addServerErrors } = useFormFields(
    { category: rule?.category ?? '', title: rule?.title ?? '', ruleValue: rule?.ruleValue ?? '', description: rule?.description ?? '' },
    validateRule,
  )
  const [isActive, setIsActive] = useState(rule?.isActive ?? true)
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }

    const payload = {
      category: form.category,
      title: form.title.trim(),
      ruleValue: form.ruleValue.trim(),
      description: form.description.trim(),
      isActive,
    }

    setSubmitting(true)
    setServerError('')
    try {
      if (isEdit) {
        await contractsApi.updateRule(contractId, rule.ruleId, payload)
        onSaved('Rule updated.')
      } else {
        await contractsApi.addRule(contractId, payload)
        onSaved('Rule added.')
      }
    } catch (error) {
      addServerErrors(error.fieldErrors)
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={isEdit ? 'Edit rule' : 'Add rule'}
      subtitle="Rules are the conditions the allocation engine must respect for this contract."
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="rule-form" loading={submitting}>
            {isEdit ? 'Save rule' : 'Add rule'}
          </Button>
        </>
      }
    >
      <form id="rule-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <SelectField label="Category" required {...field('category')} options={RULE_CATEGORIES} placeholder="Select a category" />
        <TextField label="Title" required maxLength={150} {...field('title')} placeholder="e.g. Night shift needs German speakers" autoComplete="off" />
        <TextField label="Value" maxLength={255} {...field('ruleValue')} placeholder="e.g. 2 per shift" autoComplete="off" />
        <TextArea label="Description" {...field('description')} maxLength={500} />
        <Checkbox label="Rule is active" checked={isActive} onChange={setIsActive} />
      </form>
    </Modal>
  )
}

export default RuleFormModal
