import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthHeader from '../../auth/components/AuthHeader.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Checkbox from '../../../components/ui/Checkbox.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useAuth } from '../../../context/useAuth.js'
import { onLeave } from '../../../utils/onLeave.js'
import { validateEmail, validateRequired } from '../../../utils/validators.js'
import '../../auth/pages/AuthPages.css'

/** The organization's own login: only an email and a password (no role to choose). */
function OrganizationLoginPage() {
  const { loginOrganization, sessionMessage, clearSessionMessage } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState({ email: location.state?.email || '', password: '' })
  const [remember, setRemember] = useState(false)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Passed from the register page (after registering) or the reset-password page (after a reset).
  const successMessage = location.state?.message || ''

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
    if (errors[name]) setErrors((current) => ({ ...current, [name]: '' }))
    if (serverError) setServerError('')
  }

  function validate() {
    const next = { email: validateEmail(form.email), password: validateRequired(form.password, 'Password') }
    setErrors(next)
    return !Object.values(next).some(Boolean)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    clearSessionMessage()
    if (!validate()) return

    setSubmitting(true)
    setServerError('')
    try {
      await loginOrganization({ email: form.email.trim(), password: form.password, remember })
      const from = location.state?.from
      navigate(from?.startsWith('/organization') ? from : '/organization/dashboard', { replace: true })
    } catch (error) {
      setServerError(error.message || 'Login failed. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <>
      <AuthHeader title="Organization login" subtitle="Sign in to your organization's WorkForceNexus account." />

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {sessionMessage && <Alert type="info" onClose={clearSessionMessage}>{sessionMessage}</Alert>}
        {successMessage && !serverError && <Alert type="success">{successMessage}</Alert>}
        {serverError && <Alert type="error">{serverError}</Alert>}

        <TextField
          label="Email address"
          type="email"
          name="email"
          icon="mail"
          placeholder="Enter your organization email"
          autoComplete="username"
          value={form.email}
          onChange={(event) => updateField('email', event.target.value)}
          onBlur={onLeave(() => form.email && setErrors((current) => ({ ...current, email: validateEmail(form.email) })))}
          error={errors.email}
        />

        <TextField
          label="Password"
          type="password"
          name="password"
          icon="lock"
          placeholder="Enter your password"
          autoComplete="current-password"
          value={form.password}
          onChange={(event) => updateField('password', event.target.value)}
          error={errors.password}
        />

        <div className="auth-form__row">
          <Checkbox label="Remember me" checked={remember} onChange={setRemember} />
          <Link className="auth-form__link" to="/organization/forgot-password" state={{ email: form.email.trim() }}>
            Forgot password?
          </Link>
        </div>

        <Button type="submit" fullWidth loading={submitting}>
          {submitting ? 'Signing in...' : 'Login'}
        </Button>
      </form>

      <p className="auth-form__footer">
        New organization? <Link className="auth-form__link" to="/organization/register">Register here</Link>
      </p>
      <p className="auth-form__footer">
        Staff member? <Link className="auth-form__link" to="/login">Staff login</Link>
      </p>
    </>
  )
}

export default OrganizationLoginPage
