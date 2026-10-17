import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthHeader from '../../auth/components/AuthHeader.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { register } from '../../../services/organization/organizationService.js'
import {
  validateAddress,
  validateConfirmPassword,
  validateCountry,
  validateEmail,
  validateNewPassword,
  validateOrganizationName,
  validatePhone,
} from '../../../utils/validators.js'
import '../../auth/pages/AuthPages.css'

const EMPTY = { name: '', email: '', phone: '', country: '', address: '', password: '', confirmPassword: '' }

/** An organization registers itself. When it works, the organization is taken to its own login page. */
function OrganizationRegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
    if (errors[name]) setErrors((current) => ({ ...current, [name]: '' }))
    if (serverError) setServerError('')
  }

  function validate() {
    const next = {
      name: validateOrganizationName(form.name),
      email: validateEmail(form.email),
      phone: validatePhone(form.phone, { required: true }),
      country: validateCountry(form.country, { required: true }),
      address: validateAddress(form.address, { required: true }),
      password: validateNewPassword(form.password),
      confirmPassword: validateConfirmPassword(form.password, form.confirmPassword),
    }
    setErrors(next)
    return !Object.values(next).some(Boolean)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    setServerError('')
    try {
      const result = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        country: form.country.trim(),
        address: form.address.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
      })
      navigate('/organization/login', { replace: true, state: { message: result?.message || 'Your organization was registered. Please sign in.', email: form.email.trim() } })
    } catch (error) {
      if (error.fieldErrors) setErrors((current) => ({ ...current, ...error.fieldErrors }))
      setServerError(error.message || 'Registration failed. Please try again.')
      setSubmitting(false)
    }
  }

  const field = (name) => ({
    name,
    value: form[name],
    onChange: (event) => updateField(name, event.target.value),
    error: errors[name],
  })

  return (
    <>
      <AuthHeader title="Register your organization" subtitle="Create an account for your organization on WorkForceNexus." />

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {serverError && <Alert type="error">{serverError}</Alert>}

        <TextField label="Organization name" icon="building" placeholder="Enter the organization name" maxLength={150} autoComplete="organization" {...field('name')} />
        <TextField label="Email address" type="email" icon="mail" placeholder="Enter the organization email" maxLength={150} autoComplete="email" hint="You will sign in with this email." {...field('email')} />
        <TextField label="Phone" type="tel" icon="phone" placeholder="Enter the phone number" maxLength={20} autoComplete="tel" {...field('phone')} />
        <TextField label="Country" placeholder="Enter the country" maxLength={100} autoComplete="country-name" {...field('country')} />
        <TextField label="Address" placeholder="Enter the full address" maxLength={255} autoComplete="street-address" {...field('address')} />
        <TextField
          label="Password"
          type="password"
          icon="lock"
          placeholder="Create a password"
          autoComplete="new-password"
          hint="At least 8 characters, including a letter and a number."
          {...field('password')}
        />
        <TextField label="Confirm password" type="password" icon="lock" placeholder="Re-enter the password" autoComplete="new-password" {...field('confirmPassword')} />

        <Button type="submit" fullWidth loading={submitting}>
          {submitting ? 'Registering...' : 'Register'}
        </Button>
      </form>

      <p className="auth-form__footer">
        Already registered? <Link className="auth-form__link" to="/organization/login">Sign in</Link>
      </p>
    </>
  )
}

export default OrganizationRegisterPage
