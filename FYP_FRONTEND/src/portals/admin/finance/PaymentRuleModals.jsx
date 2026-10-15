import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { exchangeRatesApi, paymentRulesApi } from '../../../services/admin/adminService.js'
import { onlyErrors, validateCurrencyCode, validateDate, validateNumber, validateRuleKey, validateText } from '../../../utils/validators.js'

function validatePaymentRule(form, isEdit) {
  const errors = {
    title: validateText(form.title, { label: 'Title', min: 3, max: 100 }),
    value: validateNumber(form.value, { label: 'Value', min: 0, max: 1000000, decimals: 4 }),
    unit: validateText(form.unit, { label: 'Unit', required: false, max: 20 }),
    description: validateText(form.description, { label: 'Description', required: false, max: 255 }),
  }
  if (!isEdit) errors.ruleKey = validateRuleKey(form.ruleKey)
  return onlyErrors(errors)
}

/** Create (no `rule`) a custom rule, or edit the value of any rule. Keys never change. */
export function PaymentRuleModal({ rule, onClose, onSaved }) {
  const isEdit = Boolean(rule)
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { form, field, checkAll, addServerErrors } = useFormFields(
    {
      ruleKey: rule?.ruleKey ?? '',
      title: rule?.title ?? '',
      value: rule ? String(rule.value) : '',
      unit: rule?.unit ?? '',
      description: rule?.description ?? '',
    },
    (values) => validatePaymentRule(values, isEdit),
  )

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }

    const body = { title: form.title.trim(), value: Number(form.value), unit: form.unit.trim(), description: form.description.trim() }

    setSubmitting(true)
    setServerError('')
    try {
      if (isEdit) {
        await paymentRulesApi.update(rule.ruleId, body)
        onSaved('Rule updated.')
      } else {
        await paymentRulesApi.create({ ...body, ruleKey: form.ruleKey.trim() })
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
      subtitle={isEdit ? rule.ruleKey : 'Custom rules are kept for reference and can be used by future features.'}
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="payment-rule-form" loading={submitting}>
            {isEdit ? 'Save rule' : 'Add rule'}
          </Button>
        </>
      }
    >
      <form id="payment-rule-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        {!isEdit && (
          <TextField
            label="Key"
            required
            maxLength={50}
            placeholder="EARLY_PAYMENT_DISCOUNT"
            hint="3 to 50 capital letters, digits and underscores."
            autoComplete="off"
            {...field('ruleKey', { clean: (value) => value.toUpperCase().replace(/\s+/g, '_') })}
          />
        )}
        <TextField label="Title" required maxLength={100} autoComplete="off" {...field('title')} />
        <div className="form-grid">
          <TextField label="Value" required type="number" inputMode="decimal" step="0.0001" min="0" max="1000000" {...field('value')} />
          <TextField label="Unit (optional)" maxLength={20} placeholder="days, %, x ..." autoComplete="off" {...field('unit')} />
        </div>
        <TextField label="Description (optional)" maxLength={255} autoComplete="off" {...field('description')} />
      </form>
    </Modal>
  )
}

function validateExchangeRate(form) {
  const errors = {
    fromCurrency: validateCurrencyCode(form.fromCurrency, 'From currency'),
    toCurrency: validateCurrencyCode(form.toCurrency, 'To currency'),
    rate: validateNumber(form.rate, { label: 'Rate', positive: true, max: 1000000, decimals: 6 }),
    effectiveDate: validateDate(form.effectiveDate, { label: 'Applies from' }),
  }
  if (!errors.fromCurrency && !errors.toCurrency && form.fromCurrency === form.toCurrency) errors.toCurrency = 'Choose a different currency from the first one.'
  return onlyErrors(errors)
}

/** Add a currency conversion rate, e.g. 1 USD = 280 PKR from a date. */
export function ExchangeRateModal({ onClose, onSaved }) {
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { form, field, checkAll, addServerErrors } = useFormFields(
    { fromCurrency: 'USD', toCurrency: 'PKR', rate: '', effectiveDate: new Date().toISOString().slice(0, 10) },
    validateExchangeRate,
  )
  const upper = (value) => value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }

    setSubmitting(true)
    setServerError('')
    try {
      await exchangeRatesApi.create({ fromCurrency: form.fromCurrency, toCurrency: form.toCurrency, rate: Number(form.rate), effectiveDate: form.effectiveDate })
      onSaved('Exchange rate added.')
    } catch (error) {
      addServerErrors(error.fieldErrors)
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Add exchange rate"
      subtitle="Used to convert payments and salaries to PKR. The newest rate on or before the date is used."
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="exchange-rate-form" loading={submitting}>
            Add rate
          </Button>
        </>
      }
    >
      <form id="exchange-rate-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <div className="form-grid">
          <TextField label="From currency" required maxLength={3} autoComplete="off" {...field('fromCurrency', { clean: upper })} />
          <TextField label="To currency" required maxLength={3} autoComplete="off" {...field('toCurrency', { clean: upper })} />
          <TextField
            label={`1 ${form.fromCurrency || '…'} equals`}
            required
            type="number"
            inputMode="decimal"
            step="0.000001"
            min="0"
            hint={`in ${form.toCurrency || '…'}`}
            {...field('rate')}
          />
          <TextField label="Applies from" required type="date" {...field('effectiveDate')} />
        </div>
      </form>
    </Modal>
  )
}
