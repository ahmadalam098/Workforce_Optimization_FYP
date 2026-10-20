import { useState } from 'react'
import Alert from '../ui/Alert.jsx'
import Button from '../ui/Button.jsx'
import TextField from '../ui/TextField.jsx'
import { useFormFields } from '../../hooks/useFormFields.js'
import { onlyErrors, validateText } from '../../utils/validators.js'

const ACCOUNT = /^[A-Za-z0-9-]{6,34}$/

/**
 * Where a salary is paid: bank, account title and account number / IBAN. The employee fills it in once (Settings > Bank details) and the admin can
 * correct it on the employee's page; the payroll sheet uses it. `onSave(body)` does the call; `onSaved(message)` is told when it worked.
 */
function BankDetailsForm({ bank, onSave, onSaved }) {
  const { form, field, checkAll, addServerErrors } = useFormFields(
    { bankName: bank?.bankName ?? '', accountTitle: bank?.accountTitle ?? '', accountNumber: bank?.accountNumber ?? '' },
    (values) =>
      onlyErrors({
        bankName: validateText(values.bankName, { label: 'The bank name', min: 2, max: 100 }),
        accountTitle: validateText(values.accountTitle, { label: 'The account title', min: 2, max: 100 }),
        accountNumber: ACCOUNT.test(values.accountNumber.replace(/\s+/g, '')) ? '' : 'The account number or IBAN must have 6 to 34 letters, digits or dashes.',
      }),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setError('Please correct the highlighted fields.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await onSave({ bankName: form.bankName.trim(), accountTitle: form.accountTitle.trim(), accountNumber: form.accountNumber })
      onSaved(result?.message || 'Bank details saved.')
    } catch (problem) {
      addServerErrors(problem.fieldErrors)
      setError(problem.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit} noValidate>
      {error && <Alert type="error">{error}</Alert>}
      <TextField label="Bank name" required maxLength={100} {...field('bankName')} />
      <TextField label="Account title" required maxLength={100} hint="The name on the account." {...field('accountTitle')} />
      <TextField label="Account number or IBAN" required maxLength={60} {...field('accountNumber')} />
      <div>
        <Button type="submit" loading={busy}>
          Save bank details
        </Button>
      </div>
    </form>
  )
}

export default BankDetailsForm
