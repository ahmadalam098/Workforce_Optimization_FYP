import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { BILLING_CYCLE_OPTIONS, CURRENCY_OPTIONS, YES_NO_OPTIONS } from '../../../constants/contracts.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { organizationContractsApi } from '../../../services/organization/organizationService.js'
import { toApiTime, toTimeInput } from '../../../utils/contractFormat.js'
import { onlyErrors, validateChoice, validateDate, validateDateOrder, validateInteger, validateText, validateTime } from '../../../utils/validators.js'

const boolToText = (value) => (value === true ? 'true' : value === false ? 'false' : 'false')
const textToNumber = (value) => (value === '' ? undefined : Number(value))

function toInitialForm(contract) {
  const terms = contract?.terms ?? {}
  return {
    startDate: terms.startDate ?? '',
    endDate: terms.endDate ?? '',
    startTime: toTimeInput(terms.startTime),
    endTime: toTimeInput(terms.endTime),
    minEmployees: terms.minEmployees ?? '',
    maxEmployees: terms.maxEmployees ?? '',
    borrowingAllowed: boolToText(terms.borrowingAllowed),
    maxBorrowedEmployees: terms.maxBorrowedEmployees ?? '',
    billingCycle: terms.billingCycle ?? '',
    billingCurrency: terms.billingCurrency ?? 'USD',
    note: '',
  }
}

function validateContract(form, isEdit) {
  const daily = form.billingCycle === 'Daily'
  const errors = {
    startDate: validateDate(form.startDate, { label: 'Start date' }),
    endDate: validateDate(form.endDate, { label: 'End date', notInPast: !isEdit }),
    startTime: validateTime(form.startTime, { label: 'Daily start time', required: daily || Boolean(form.endTime) }),
    endTime: validateTime(form.endTime, { label: 'Daily end time', required: daily || Boolean(form.startTime) }),
    minEmployees: validateInteger(form.minEmployees, { label: 'Minimum employees', min: daily ? 1 : 0, max: 100000 }),
    maxEmployees: validateInteger(form.maxEmployees, { label: 'Maximum employees', min: 1, max: 100000 }),
    maxBorrowedEmployees: validateInteger(form.maxBorrowedEmployees, { label: 'Max borrowed employees', required: false, min: 0, max: 100000 }),
    billingCycle: validateChoice(form.billingCycle, BILLING_CYCLE_OPTIONS, 'Billing cycle'),
    billingCurrency: validateChoice(form.billingCurrency, CURRENCY_OPTIONS, 'Currency'),
    note: validateText(form.note, { label: 'The note', required: false, max: 400 }),
  }
  if (!errors.endDate) errors.endDate = validateDateOrder(form.startDate, form.endDate, { endLabel: 'End date', startLabel: 'the start date' })
  if (!errors.maxEmployees && form.minEmployees !== '' && Number(form.maxEmployees) < Number(form.minEmployees)) errors.maxEmployees = 'Maximum cannot be less than minimum.'
  if (!errors.startTime && !errors.endTime && form.startTime && form.startTime === form.endTime) errors.endTime = 'The daily end time cannot be the same as the start time.'
  if (!errors.maxBorrowedEmployees && form.maxBorrowedEmployees !== '' && form.maxEmployees !== '' && Number(form.maxBorrowedEmployees) > Number(form.maxEmployees)) {
    errors.maxBorrowedEmployees = 'Cannot be more than the maximum employees.'
  }
  return onlyErrors(errors)
}

/**
 * The organization asks for a contract (no `contract`) or changes a request that is still Pending. It sets the period, how many employees
 * it needs, borrowing and how it is billed; the admin sets the hourly rates when reviewing it.
 */
function OrganizationContractFormModal({ contract, onClose, onSaved }) {
  const isEdit = Boolean(contract)
  const { form, field, checkAll, addServerErrors } = useFormFields(toInitialForm(contract), (values) => validateContract(values, isEdit))
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }
    const payload = {
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      startTime: toApiTime(form.startTime),
      endTime: toApiTime(form.endTime),
      minEmployees: textToNumber(form.minEmployees),
      maxEmployees: textToNumber(form.maxEmployees),
      borrowingAllowed: form.borrowingAllowed === 'true',
      maxBorrowedEmployees: form.borrowingAllowed === 'true' ? textToNumber(form.maxBorrowedEmployees) : undefined,
      billingCycle: form.billingCycle || undefined,
      billingCurrency: form.billingCurrency || undefined,
      note: form.note.trim() || undefined,
    }

    setSubmitting(true)
    setServerError('')
    try {
      const result = isEdit ? await organizationContractsApi.update(contract.contractId, payload) : await organizationContractsApi.create(payload)
      onSaved(result?.message || 'Saved.', result)
    } catch (error) {
      addServerErrors(error.fieldErrors)
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  const number = (name, label, extra = {}) => <TextField label={label} type="number" inputMode="numeric" min="0" {...field(name)} {...extra} />

  return (
    <Modal
      title={isEdit ? 'Change your contract request' : 'Ask for a contract'}
      subtitle={isEdit ? 'You can change it until the admin decides. The hourly rates are set by the admin.' : 'The admin reviews your request, sets the hourly rates and approves it.'}
      size="lg"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="organization-contract-form" loading={submitting}>
            {isEdit ? 'Save changes' : 'Send request'}
          </Button>
        </>
      }
    >
      <form id="organization-contract-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}

        <div className="form-grid">
          <p className="form-section-title">How you are billed</p>
          <SelectField label="Billing cycle" {...field('billingCycle')} options={BILLING_CYCLE_OPTIONS} placeholder="Choose the billing cycle" />
          <SelectField label="Currency" {...field('billingCurrency')} options={CURRENCY_OPTIONS} />
          {form.billingCycle === 'Daily' && (
            <div className="form-grid__full">
              <Alert type="info">
                <strong>Daily contract.</strong> The minimum employees are appointed to your organization automatically every day, from the daily start time to the daily end time. If you need
                more on some days, ask for them with a staff request: they come on top of the minimum, up to your maximum.
              </Alert>
            </div>
          )}

          <p className="form-section-title">Period</p>
          <TextField label="Start date" type="date" {...field('startDate')} />
          <TextField label="End date" type="date" {...field('endDate')} />
          <TextField label="Daily start time" type="time" {...field('startTime')} hint={form.billingCycle === 'Daily' ? 'Required for a daily contract.' : 'Optional.'} />
          <TextField label="Daily end time" type="time" {...field('endTime')} />

          <p className="form-section-title">Employees you need</p>
          {number('minEmployees', form.billingCycle === 'Daily' ? 'Minimum employees every day' : 'Minimum employees')}
          {number('maxEmployees', 'Maximum employees')}

          <p className="form-section-title">Borrowing</p>
          <SelectField label="Borrowing allowed" {...field('borrowingAllowed')} options={YES_NO_OPTIONS} hint="Employees of other organizations can work for you." />
          {form.borrowingAllowed === 'true' && number('maxBorrowedEmployees', 'Max borrowed employees')}

          <TextArea label="Note for the admin (optional)" className="form-grid__full" rows={3} maxLength={400} {...field('note')} />
        </div>
      </form>
    </Modal>
  )
}

export default OrganizationContractFormModal
