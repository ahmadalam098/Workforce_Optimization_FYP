import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import AuthHeader from '../components/AuthHeader.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import { sendOtp, verifyOtp } from '../../../services/authService.js'
import { validateOtp } from '../../../utils/validators.js'
import './AuthPages.css'

const RESEND_COOLDOWN_SECONDS = 60

/** Step 2 of 3: verify the OTP sent to the user's email. */
function VerifyOtpPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const email = location.state?.email

  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [serverError, setServerError] = useState('')
  const [notice, setNotice] = useState(`We sent a 6-digit code to your email. It is valid for 5 minutes.`)
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  // This page only makes sense after step 1.
  if (!email) return <Navigate to="/forgot-password" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    const validationError = validateOtp(otp)
    setError(validationError)
    if (validationError) return

    setSubmitting(true)
    setServerError('')
    try {
      await verifyOtp(email, otp)
      navigate('/reset-password', { replace: true, state: { email, verified: true } })
    } catch (err) {
      setServerError(err.message)
      setSubmitting(false)
    }
  }

  async function handleResend() {
    setResending(true)
    setServerError('')
    try {
      await sendOtp(email)
      setOtp('')
      setNotice('A new code has been sent. Previous codes no longer work.')
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      setServerError(err.message)
    } finally {
      setResending(false)
    }
  }

  return (
    <>
      <AuthHeader icon="mail" title="Check your email" subtitle="Enter the verification code sent to:" />
      <p className="auth-form__email auth-form__email--below-header">{email}</p>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {serverError ? <Alert type="error">{serverError}</Alert> : <Alert type="info">{notice}</Alert>}

        <TextField
          label="Verification code"
          name="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          maxLength={6}
          inputClassName="otp-input"
          value={otp}
          onChange={(event) => {
            setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))
            if (error) setError('')
            if (serverError) setServerError('')
          }}
          error={error}
        />

        <Button type="submit" fullWidth loading={submitting}>
          {submitting ? 'Verifying...' : 'Verify code'}
        </Button>

        <div className="auth-form__resend">
          <span>Didn't get the code?</span>
          {cooldown > 0 ? (
            <span>Resend in {cooldown}s</span>
          ) : (
            <Button variant="link" onClick={handleResend} loading={resending}>
              Resend code
            </Button>
          )}
        </div>
      </form>

      <p className="auth-form__footer">
        <Link className="auth-form__back" to="/forgot-password" state={{ email }}>
          <Icon name="arrowLeft" size={16} /> Use a different email
        </Link>
      </p>
    </>
  )
}

export default VerifyOtpPage
