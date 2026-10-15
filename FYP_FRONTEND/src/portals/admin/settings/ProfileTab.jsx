import { useState } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Button from '../../../components/ui/Button.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import ProfilePhotoEditor from '../../../components/profile/ProfilePhotoEditor.jsx'
import { useAuth } from '../../../context/useAuth.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { myProfileApi } from '../../../services/admin/adminService.js'
import { onlyErrors, validateConfirmPassword, validateEmail, validateNewPassword, validatePersonName, validateText } from '../../../utils/validators.js'

function ProfileForm({ user, onSaved }) {
  const { updateUser } = useAuth()
  const { form, field, checkAll, addServerErrors } = useFormFields(
    { fullName: user?.fullName ?? '', email: user?.email ?? '' },
    (values) => onlyErrors({ fullName: validatePersonName(values.fullName), email: validateEmail(values.email) }),
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
      const result = await myProfileApi.update({ fullName: form.fullName.trim(), email: form.email.trim() })
      updateUser(result.user)
      onSaved(result.message || 'Your profile was saved.')
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
      <TextField label="Full name" required maxLength={100} autoComplete="name" {...field('fullName')} />
      <TextField label="Email" type="email" required maxLength={150} autoComplete="email" hint="You sign in with this email." {...field('email')} />
      <div>
        <Button type="submit" loading={busy}>
          Save profile
        </Button>
      </div>
    </form>
  )
}

function PasswordForm({ onSaved }) {
  const { form, field, checkAll, addServerErrors, reset } = useFormFields(
    { currentPassword: '', newPassword: '', confirm: '' },
    (values) =>
      onlyErrors({
        currentPassword: validateText(values.currentPassword, { label: 'The current password', max: 100 }),
        newPassword: validateNewPassword(values.newPassword),
        confirm: validateConfirmPassword(values.newPassword, values.confirm),
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
      const result = await myProfileApi.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
      reset()
      onSaved(result?.message || 'Your password was changed.')
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
      <TextField label="Current password" type="password" required autoComplete="current-password" {...field('currentPassword')} />
      <TextField label="New password" type="password" required autoComplete="new-password" hint="The rules are set in Settings > Security." {...field('newPassword')} />
      <TextField label="Confirm new password" type="password" required autoComplete="new-password" {...field('confirm')} />
      <div>
        <Button type="submit" loading={busy}>
          Change password
        </Button>
      </div>
    </form>
  )
}

/** The signed-in admin: name, email, picture and password. */
function ProfileTab({ onSaved }) {
  const { user, setPictureVersion } = useAuth()

  return (
    <div className="details-grid">
      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Your details</h3>
        </div>
        <div className="card__body form-stack">
          <ProfilePhotoEditor userId={user?.userId} name={user?.fullName} version={user?.pictureVersion} onChanged={setPictureVersion} />
          {/* key: the form starts again from the saved name and email */}
          <ProfileForm key={`${user?.fullName}|${user?.email}`} user={user} onSaved={onSaved} />
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Change password</h3>
        </div>
        <div className="card__body">
          <PasswordForm onSaved={onSaved} />
        </div>
      </section>
    </div>
  )
}

export default ProfileTab
