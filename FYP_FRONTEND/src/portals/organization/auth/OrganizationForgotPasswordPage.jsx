import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthHeader from '../../auth/components/AuthHeader.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { sendOtp } from '../../../services/organization/organizationService.js'
import { onLeave } from '../../../utils/onLeave.js'
import { validateEmail } from '../../../utils/validators.js'
import '../../auth/pages/AuthPages.css'

/** Step 1 of 3 for an organization: request a 6-digit OTP by email (kept in Redis by the backend for 5 minutes). */
function OrganizationForgotPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState(location.state?.email || '')
  const [error, setError] = useState('')
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    const validationError = validateEmail(email)
    setError(validationError)
    if (validationError) return

    setSubmitting(true)
    setServerError('')
    try {
      const cleanEmail = email.trim()
      await sendOtp(cleanEmail)
      navigate('/organization/verify-otp', { state: { email: cleanEmail } })
    } catch (err) {
      setServerError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <>
      <AuthHeader icon="key" title="Forgot password?" subtitle="Enter your organization's email address and we'll send you a 6-digit verification code." />

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {serverError && <Alert type="error">{serverError}</Alert>}

        <TextField
          label="Email address"
          type="email"
          name="email"
          icon="mail"
          placeholder="Enter your organization email"
          autoComplete="email"
          onBlur={onLeave(() => email && setError(validateEmail(email)))}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            if (error) setError('')
            if (serverError) setServerError('')
          }}
          error={error}
        />

        <Button type="submit" fullWidth loading={submitting}>
          {submitting ? 'Sending code...' : 'Send verification code'}
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

export default OrganizationForgotPasswordPage
