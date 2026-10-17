import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { BILLING_CYCLE_OPTIONS, YES_NO_OPTIONS } from '../../../constants/contracts.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { organizationContractsApi } from '../../../services/organization/organizationService.js'
import { toApiTime, toTimeInput } from '../../../utils/contractFormat.js'
import { onlyErrors, validateChoice, validateDate, validateInteger, validateText, validateTime } from '../../../utils/validators.js'

const textToNumber = (value) => (value === '' ? undefined : Number(value))

function tomorrow() {
  const day = new Date()
  day.setDate(day.getDate() + 1)
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}

function toInitialForm(terms) {
  return {
    endDate: terms.endDate ?? '',
    startTime: toTimeInput(terms.startTime),
    endTime: toTimeInput(terms.endTime),
    minEmployees: terms.minEmployees ?? '',
    maxEmployees: terms.maxEmployees ?? '',
    borrowingAllowed: terms.borrowingAllowed ? 'true' : 'false',
    maxBorrowedEmployees: terms.maxBorrowedEmployees ?? '',
    billingCycle: terms.billingCycle ?? '',
    effectiveDate: tomorrow(),
    comment: '',
  }
}

function validateChange(form) {
  const daily = form.billingCycle === 'Daily'
  const errors = {
    endDate: validateDate(form.endDate, { label: 'End date', notInPast: true }),
    startTime: validateTime(form.startTime, { label: 'Daily start time', required: daily || Boolean(form.endTime) }),
    endTime: validateTime(form.endTime, { label: 'Daily end time', required: daily || Boolean(form.startTime) }),
    minEmployees: validateInteger(form.minEmployees, { label: 'Minimum employees', min: daily ? 1 : 0, max: 100000 }),
    maxEmployees: validateInteger(form.maxEmployees, { label: 'Maximum employees', min: 1, max: 100000 }),
    maxBorrowedEmployees: validateInteger(form.maxBorrowedEmployees, { label: 'Max borrowed employees', required: false, min: 0, max: 100000 }),
    billingCycle: validateChoice(form.billingCycle, BILLING_CYCLE_OPTIONS, 'Billing cycle'),
    effectiveDate: validateDate(form.effectiveDate, { label: 'Start date of the change', required: false, notInPast: true }),
    comment: validateText(form.comment, { label: 'The reason', min: 10, max: 500 }),
  }
  if (!errors.maxEmployees && form.minEmployees !== '' && Number(form.maxEmployees) < Number(form.minEmployees)) errors.maxEmployees = 'Maximum cannot be less than minimum.'
  if (!errors.startTime && !errors.endTime && form.startTime && form.startTime === form.endTime) errors.endTime = 'The daily end time cannot be the same as the start time.'
  return onlyErrors(errors)
}

/** Does the form still hold exactly what the contract has? Then there is nothing to ask for. */
function unchanged(form, terms) {
  const initial = toInitialForm(terms)
  return ['endDate', 'startTime', 'endTime', 'minEmployees', 'maxEmployees', 'borrowingAllowed', 'maxBorrowedEmployees', 'billingCycle'].every((key) => String(form[key]) === String(initial[key]))
}

/**
 * The organization asks to change its approved contract. Nothing changes until the admin approves: the current contract keeps running. The
 * hourly rates are fixed, so they are not here. The reason is required, and the change can start on a day the organization chooses.
 */
function OrganizationContractChangeModal({ contract, onClose, onSaved }) {
  const terms = contract.terms
  const { form, field, checkAll, addServerErrors } = useFormFields(toInitialForm(terms), validateChange)
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }
    if (unchanged(form, terms)) {
      setServerError('Change at least one term of the contract, then explain why.')
      return
    }

    setSubmitting(true)
    setServerError('')
    try {
      const result = await organizationContractsApi.requestChange(contract.contractId, {
        endDate: form.endDate || undefined,
        startTime: toApiTime(form.startTime),
        endTime: toApiTime(form.endTime),
        minEmployees: textToNumber(form.minEmployees),
        maxEmployees: textToNumber(form.maxEmployees),
        borrowingAllowed: form.borrowingAllowed === 'true',
        maxBorrowedEmployees: form.borrowingAllowed === 'true' ? textToNumber(form.maxBorrowedEmployees) : undefined,
        billingCycle: form.billingCycle || undefined,
        effectiveDate: form.effectiveDate || undefined,
        comment: form.comment.trim(),
      })
      onSaved(result?.message || 'Your change request was sent.')
    } catch (error) {
      addServerErrors(error.fieldErrors)
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  const number = (name, label) => <TextField label={label} type="number" inputMode="numeric" min="0" {...field(name)} />

  return (
    <Modal
      title="Ask to change this contract"
      subtitle={`${contract.contractNumber} stays as it is until the admin approves your change.`}
      size="lg"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="organization-contract-change-form" loading={submitting}>
            Send to the admin
          </Button>
        </>
      }
    >
      <form id="organization-contract-change-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <Alert type="info">Change only what you need. The hourly rates are fixed and cannot be changed. If the admin does not approve, your current contract keeps running.</Alert>

        <div className="form-grid">
          <p className="form-section-title">Employees</p>
          {number('minEmployees', form.billingCycle === 'Daily' ? 'Minimum employees every day' : 'Minimum employees')}
          {number('maxEmployees', 'Maximum employees')}

          <p className="form-section-title">Schedule</p>
          <SelectField label="Billing cycle" {...field('billingCycle')} options={BILLING_CYCLE_OPTIONS} />
          <TextField label="End date" type="date" {...field('endDate')} />
          <TextField label="Daily start time" type="time" {...field('startTime')} />
          <TextField label="Daily end time" type="time" {...field('endTime')} />

          <p className="form-section-title">Borrowing</p>
          <SelectField label="Borrowing allowed" {...field('borrowingAllowed')} options={YES_NO_OPTIONS} />
          {form.borrowingAllowed === 'true' && number('maxBorrowedEmployees', 'Max borrowed employees')}

          <p className="form-section-title">When and why</p>
          <TextField label="Start the change on" type="date" {...field('effectiveDate')} hint="Until this day your current contract applies. Leave empty to start as soon as the admin approves." />
          <TextArea label="Why do you need this change?" required className="form-grid__full" rows={3} maxLength={500} hint="The admin reads this when deciding." {...field('comment')} />
        </div>
      </form>
    </Modal>
  )
}

export default OrganizationContractChangeModal
