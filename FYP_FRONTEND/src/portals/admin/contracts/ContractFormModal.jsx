import { useCallback, useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { BILLING_CYCLE_OPTIONS, CURRENCY_OPTIONS, PRIORITY_OPTIONS, YES_NO_OPTIONS } from '../../../constants/contracts.js'
import { contractsApi } from '../../../services/admin/adminService.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { toApiTime, toTimeInput } from '../../../utils/contractFormat.js'
import { onlyErrors, validateChoice, validateDate, validateDateOrder, validateInteger, validateNumber, validateText, validateTime } from '../../../utils/validators.js'

const boolToText = (value) => (value === true ? 'true' : value === false ? 'false' : '')
const textToBool = (value) => (value === '' ? undefined : value === 'true')
const textToNumber = (value) => (value === '' ? undefined : Number(value))

function toInitialForm(contract) {
  const terms = contract?.terms ?? {}
  return {
    organizationId: contract?.organizationId ? String(contract.organizationId) : '',
    contractNumber: contract?.contractNumber ?? '',
    startDate: terms.startDate ?? '',
    endDate: terms.endDate ?? '',
    startTime: toTimeInput(terms.startTime),
    endTime: toTimeInput(terms.endTime),
    minEmployees: terms.minEmployees ?? '',
    maxEmployees: terms.maxEmployees ?? '',
    borrowingAllowed: boolToText(terms.borrowingAllowed),
    maxBorrowedEmployees: terms.maxBorrowedEmployees ?? '',
    priorityLevel: terms.priorityLevel ?? '',
    billingCurrency: terms.billingCurrency ?? 'USD',
    billingCycle: terms.billingCycle ?? '',
    baseHourlyRate: terms.baseHourlyRate ?? '',
    extraHourlyRate: terms.extraHourlyRate ?? '',
    changeSummary: '',
  }
}

function validateContract(form, isEdit, live) {
  const errors = {
    contractNumber: validateText(form.contractNumber, { label: 'Contract number', required: false, max: 100, pattern: /^[A-Za-z0-9][A-Za-z0-9/_-]*$/, patternMessage: 'Use letters, numbers and / _ - only.' }),
    startDate: validateDate(form.startDate, { label: 'Start date' }),
    endDate: validateDate(form.endDate, { label: 'End date', notInPast: !isEdit }),
    startTime: validateTime(form.startTime, { label: 'Daily start time', required: Boolean(form.endTime) }),
    endTime: validateTime(form.endTime, { label: 'Daily end time', required: Boolean(form.startTime) }),
    minEmployees: validateInteger(form.minEmployees, { label: 'Minimum employees', min: 0, max: 100000 }),
    maxEmployees: validateInteger(form.maxEmployees, { label: 'Maximum employees', min: 1, max: 100000 }),
    maxBorrowedEmployees: validateInteger(form.maxBorrowedEmployees, { label: 'Max borrowed employees', required: false, min: 0, max: 100000 }),
    priorityLevel: form.priorityLevel ? validateChoice(form.priorityLevel, PRIORITY_OPTIONS, 'Priority') : '',
    billingCurrency: validateChoice(form.billingCurrency, CURRENCY_OPTIONS, 'Currency'),
    billingCycle: validateChoice(form.billingCycle, BILLING_CYCLE_OPTIONS, 'Billing cycle'),
    baseHourlyRate: validateNumber(form.baseHourlyRate, { label: 'Base hourly rate', min: 0, max: 100000, positive: true }),
    extraHourlyRate: validateNumber(form.extraHourlyRate, { label: 'Extra hourly rate', required: false, min: 0, max: 100000 }),
  }
  if (!isEdit && !form.organizationId) errors.organizationId = 'Select an organization.'
  if (live) errors.changeSummary = validateText(form.changeSummary, { label: 'This note', min: 5, max: 500 })
  if (!errors.endDate) errors.endDate = validateDateOrder(form.startDate, form.endDate, { endLabel: 'End date', startLabel: 'the start date' })
  if (!errors.maxEmployees && form.minEmployees !== '' && Number(form.maxEmployees) < Number(form.minEmployees)) errors.maxEmployees = 'Maximum cannot be less than minimum.'
  if (!errors.maxBorrowedEmployees && form.maxBorrowedEmployees !== '' && form.maxEmployees !== '' && Number(form.maxBorrowedEmployees) > Number(form.maxEmployees)) errors.maxBorrowedEmployees = 'Cannot be more than the maximum employees.'
  if (!errors.startTime && !errors.endTime && form.startTime && form.startTime === form.endTime) errors.endTime = 'The daily end time cannot be the same as the start time.'
  // A daily contract appoints its minimum employees every day, inside the daily window.
  if (form.billingCycle === 'Daily') {
    if (!errors.minEmployees && Number(form.minEmployees) < 1) errors.minEmployees = 'A daily contract needs at least 1 minimum employee.'
    if (!form.startTime && !errors.startTime) errors.startTime = 'A daily contract needs the daily start time.'
    if (!form.endTime && !errors.endTime) errors.endTime = 'A daily contract needs the daily end time.'
  }
  return onlyErrors(errors)
}

/**
 * Create (no `contract`) or edit a contract that is still Pending.
 * `organizations` are the organizations that can receive a contract (approved ones).
 */
function ContractFormModal({ contract, organizations, defaultOrganizationId, onClose, onSaved }) {
  const isEdit = Boolean(contract)
  // An approved contract is changed by saving a new version; the old one stays in the history.
  const live = isEdit && contract.status !== 'Pending'
  const validate = useCallback((values) => validateContract(values, isEdit, live), [isEdit, live])
  const initial = toInitialForm(contract)
  if (!isEdit && defaultOrganizationId) initial.organizationId = String(defaultOrganizationId)
  const { form, field, checkAll, addServerErrors } = useFormFields(initial, validate)
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const organizationOptions = organizations.map((org) => ({
    value: String(org.organizationId),
    label: org.name || `Organization #${org.organizationId}`,
  }))

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }

    const payload = {
      contractNumber: form.contractNumber.trim() || undefined,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      startTime: toApiTime(form.startTime),
      endTime: toApiTime(form.endTime),
      minEmployees: textToNumber(form.minEmployees),
      maxEmployees: textToNumber(form.maxEmployees),
      borrowingAllowed: textToBool(form.borrowingAllowed),
      maxBorrowedEmployees: textToNumber(form.maxBorrowedEmployees),
      priorityLevel: form.priorityLevel || undefined,
      billingCurrency: form.billingCurrency || undefined,
      billingCycle: form.billingCycle || undefined,
      baseHourlyRate: textToNumber(form.baseHourlyRate),
      extraHourlyRate: textToNumber(form.extraHourlyRate),
      changeSummary: live ? form.changeSummary.trim() : undefined,
    }

    setSubmitting(true)
    setServerError('')
    try {
      if (isEdit) {
        const updated = await contractsApi.update(contract.contractId, payload)
        onSaved(updated?.message || 'Contract updated.')
      } else {
        const result = await contractsApi.create({ ...payload, organizationId: Number(form.organizationId) })
        onSaved(result?.message || 'Contract created.', result)
      }
    } catch (error) {
      addServerErrors(error.fieldErrors)
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  const number = (name, label, extra = {}) => (
    <TextField label={label} type="number" inputMode="numeric" min="0" {...field(name)} {...extra} />
  )

  return (
    <Modal
      title={isEdit ? 'Edit contract' : 'New contract'}
      subtitle={
        live
          ? 'Your changes are saved as a new version. The earlier terms stay in the history.'
          : isEdit
            ? 'This contract is waiting for approval, so it can be changed freely.'
            : 'The contract is created as Pending and must be approved to become active.'
      }
      size="lg"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="contract-form" loading={submitting}>
            {isEdit ? 'Save changes' : 'Create contract'}
          </Button>
        </>
      }
    >
      <form id="contract-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}

        <div className="form-grid">
          <SelectField
            label="Organization"
            {...field('organizationId')}
            options={organizationOptions}
            placeholder="Select an organization"
            disabled={isEdit}
            hint={organizations.length === 0 ? 'No approved organizations yet. Approve an organization first.' : undefined}
          />
          <TextField
            label="Contract number"
            {...field('contractNumber')}
            hint={isEdit ? undefined : 'Leave empty to generate one (CNT-001).'}
            autoComplete="off"
          />

          <p className="form-section-title">Period</p>
          <TextField label="Start date" type="date" {...field('startDate')} />
          <TextField label="End date" type="date" {...field('endDate')} />
          <TextField label="Daily start time" type="time" {...field('startTime')} />
          <TextField label="Daily end time" type="time" {...field('endTime')} />

          <p className="form-section-title">Staffing</p>
          {number('minEmployees', 'Minimum employees')}
          {number('maxEmployees', 'Maximum employees')}
          <SelectField label="Priority" {...field('priorityLevel')} options={PRIORITY_OPTIONS} placeholder="Not set" />

          <p className="form-section-title">Borrowing</p>
          <SelectField label="Borrowing allowed" {...field('borrowingAllowed')} options={YES_NO_OPTIONS} placeholder="Not set" />
          {number('maxBorrowedEmployees', 'Max borrowed employees')}

          <p className="form-section-title">Payment</p>
          <SelectField label="Currency" {...field('billingCurrency')} options={CURRENCY_OPTIONS} />
          <SelectField label="Billing cycle" {...field('billingCycle')} options={BILLING_CYCLE_OPTIONS} placeholder="Not set" />
          {form.billingCycle === 'Daily' && (
            <div className="form-grid__full">
              <Alert type="info">
                <strong>Daily contract.</strong> The minimum employees are appointed to the organization automatically every day, from the daily start time to the daily end time, and
                released at the end of it. More employees can come through staff requests, on top of the minimum and up to the maximum. Set the minimum employees and the daily start and
                end time above.
              </Alert>
            </div>
          )}
          {number('baseHourlyRate', 'Base hourly rate', { step: '0.01' })}
          {number('extraHourlyRate', 'Extra hourly rate', { step: '0.01' })}

          {live && (
            <TextArea
              label="What changed and why"
              required
              className="form-grid__full"
              maxLength={500}
              hint="Kept with the new version, so everyone can see the reason later."
              {...field('changeSummary')}
            />
          )}
        </div>
      </form>
    </Modal>
  )
}

export default ContractFormModal
