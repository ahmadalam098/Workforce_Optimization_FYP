import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import AuthHeader from '../../auth/components/AuthHeader.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { resetPassword } from '../../../services/organization/organizationService.js'
import { validateConfirmPassword, validateNewPassword } from '../../../utils/validators.js'
import '../../auth/pages/AuthPages.css'

/** Step 3 of 3 for an organization: set a new password (allowed for 10 minutes after the OTP was verified). */
function OrganizationResetPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const email = location.state?.email
  const verified = location.state?.verified

  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!email || !verified) return <Navigate to="/organization/forgot-password" replace />

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
    if (errors[name]) setErrors((current) => ({ ...current, [name]: '' }))
    if (serverError) setServerError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const next = {
      newPassword: validateNewPassword(form.newPassword),
      confirmPassword: validateConfirmPassword(form.newPassword, form.confirmPassword),
    }
    setErrors(next)
    if (Object.values(next).some(Boolean)) return

    setSubmitting(true)
    setServerError('')
    try {
      await resetPassword({ email, ...form })
      navigate('/organization/login', {
        replace: true,
        state: { message: 'Your password has been reset. Please sign in with your new password.', email },
      })
    } catch (err) {
      if (err.fieldErrors) setErrors((current) => ({ ...current, ...err.fieldErrors }))
      setServerError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <>
      <AuthHeader icon="lock" title="Set a new password" subtitle="Choose a new password for your organization's account." />

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {serverError && (
          <Alert type="error">
            {serverError}{' '}
            {/OTP verification required/i.test(serverError) && (
              <Link to="/organization/forgot-password" state={{ email }}>
                Request a new code
              </Link>
            )}
          </Alert>
        )}

        <TextField
          label="New password"
          type="password"
          name="newPassword"
          icon="lock"
          placeholder="Enter new password"
          autoComplete="new-password"
          hint="At least 8 characters, including a letter and a number."
          value={form.newPassword}
          onChange={(event) => updateField('newPassword', event.target.value)}
          error={errors.newPassword}
        />

        <TextField
          label="Confirm password"
          type="password"
          name="confirmPassword"
          icon="lock"
          placeholder="Re-enter new password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(event) => updateField('confirmPassword', event.target.value)}
          error={errors.confirmPassword}
        />

        <Button type="submit" fullWidth loading={submitting}>
          {submitting ? 'Resetting...' : 'Reset password'}
        </Button>
      </form>

      <p className="auth-form__footer">
        <Link className="auth-form__back" to="/organization/login">
          <Icon name="arrowLeft" size={16} /> Back to organization login
        </Link>
      </p>
    </>
  )
}

export default OrganizationResetPasswordPage
