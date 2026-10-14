import TextField from '../../../components/ui/TextField.jsx'
import { cleanPhoneInput, formatCnicInput } from '../../../utils/validators.js'

/**
 * The fields every person account has, with the typing helpers (phone keeps digits, CNIC adds its dashes).
 * `field` comes from useFormFields.
 */
function PersonFields({ field, isEdit, passwordHint }) {
  return (
    <>
      <TextField label="Full name" required maxLength={100} autoComplete="off" {...field('fullName')} />
      <TextField label="Email address" type="email" required maxLength={150} autoComplete="off" {...field('email')} />
      <TextField label="Phone" type="tel" inputMode="tel" required maxLength={20} placeholder="+92 300 1234567" autoComplete="off" {...field('phone', { clean: cleanPhoneInput })} />
      <TextField label="CNIC" inputMode="numeric" required maxLength={15} placeholder="12345-1234567-1" autoComplete="off" {...field('cnic', { clean: formatCnicInput })} />
      <TextField label="Age" type="number" inputMode="numeric" min="16" max="80" step="1" {...field('age')} />
      <TextField label="Country" maxLength={100} autoComplete="off" {...field('country')} />
      {!isEdit && (
        <TextField
          label="Temporary password"
          type="password"
          className="form-grid__full"
          required
          maxLength={100}
          hint={passwordHint}
          autoComplete="new-password"
          {...field('password')}
        />
      )}
    </>
  )
}

export default PersonFields
