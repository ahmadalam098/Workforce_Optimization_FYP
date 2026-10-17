import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthHeader from '../components/AuthHeader.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import RoleSelect from '../../../components/ui/RoleSelect.jsx'
import Checkbox from '../../../components/ui/Checkbox.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { useAuth } from '../../../context/useAuth.js'
import { LOGIN_ROLE_OPTIONS, getRoleHome } from '../../../constants/roles.js'
import { onLeave } from '../../../utils/onLeave.js'
import { validateEmail, validateRequired } from '../../../utils/validators.js'
import './AuthPages.css'

function LoginPage() {
  const { login, sessionMessage, clearSessionMessage } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState({ roleName: '', email: '', password: '' })
  const [remember, setRemember] = useState(false)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Message passed from the reset-password page after a successful reset.
  const successMessage = location.state?.message || ''

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
    if (errors[name]) setErrors((current) => ({ ...current, [name]: '' }))
    if (serverError) setServerError('')
  }

  function validate() {
    const nextErrors = {
      roleName: validateRequired(form.roleName, 'Role'),
      email: validateEmail(form.email),
      password: validateRequired(form.password, 'Password'),
    }
    setErrors(nextErrors)
    return !Object.values(nextErrors).some(Boolean)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    clearSessionMessage()
    if (!validate()) return

    setSubmitting(true)
    setServerError('')
    try {
      const user = await login({
        email: form.email.trim(),
        password: form.password,
        roleName: form.roleName,
        remember,
      })
      // Return to the page the user originally wanted, if it belongs to their own portal.
      const home = getRoleHome(user.roleName)
      const portalPrefix = home.split('/').slice(0, 2).join('/')
      const from = location.state?.from
      navigate(from?.startsWith(portalPrefix) ? from : home, { replace: true })
    } catch (error) {
      setServerError(error.message || 'Login failed. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <>
      <AuthHeader title="Welcome back!" subtitle="Sign in to your WorkForceNexus account." />

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {sessionMessage && <Alert type="info" onClose={clearSessionMessage}>{sessionMessage}</Alert>}
        {successMessage && !serverError && <Alert type="success">{successMessage}</Alert>}
        {serverError && <Alert type="error">{serverError}</Alert>}

        <RoleSelect
          label="Login as"
          options={LOGIN_ROLE_OPTIONS}
          value={form.roleName}
          onChange={(value) => updateField('roleName', value)}
          error={errors.roleName}
        />

        <TextField
          label="Email address"
          type="email"
          name="email"
          icon="mail"
          placeholder="Enter your email"
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
          <Link className="auth-form__link" to="/forgot-password" state={{ email: form.email.trim() }}>
            Forgot password?
          </Link>
        </div>

        <Button type="submit" fullWidth loading={submitting}>
          {submitting ? 'Signing in...' : 'Login'}
        </Button>
      </form>

      <p className="auth-form__footer">Staff accounts are created by the system administrator.</p>
      <p className="auth-form__footer">
        Are you an organization? <Link className="auth-form__link" to="/organization/login">Organization login</Link> ·{' '}
        <Link className="auth-form__link" to="/organization/register">Register</Link>
      </p>
    </>
  )
}

export default LoginPage
