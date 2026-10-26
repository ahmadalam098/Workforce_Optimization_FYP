import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ProfilePhotoEditor from '../../../components/profile/ProfilePhotoEditor.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Checkbox from '../../../components/ui/Checkbox.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useAuth } from '../../../context/useAuth.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { employeeSettingsApi } from '../../../services/employee/employeeService.js'
import { formatDate, formatDateTime, humanize } from '../../../utils/format.js'
import { onlyErrors, validateConfirmPassword, validateNewPassword, validatePhone, validateText } from '../../../utils/validators.js'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { ErrorState } from '../../admin/shared/StateBox.jsx'

const TABS = [
  { id: 'profile', label: 'Profile', description: 'Your picture and phone number, and your details as the admin has them.' },
  { id: 'security', label: 'Security', description: 'Change your password and see when you signed in.' },
  { id: 'notifications', label: 'Notifications', description: 'Show or hide the notification bell.' },
]

function InfoItem({ label, children }) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd>{children || <span className="cell-muted">—</span>}</dd>
    </div>
  )
}

function PhoneForm({ profile, onSaved }) {
  const { form, field, checkAll, addServerErrors } = useFormFields({ phone: profile.phone ?? '' }, (values) => onlyErrors({ phone: validatePhone(values.phone) }))
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
      const result = await employeeSettingsApi.updateProfile({ phone: form.phone.trim() })
      onSaved(result?.message || 'Your phone number was saved.')
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
      <TextField label="Phone" type="tel" maxLength={20} autoComplete="tel" hint="Optional. This is the only detail you can change; ask the admin for the rest." {...field('phone')} />
      <div>
        <Button type="submit" loading={busy}>
          Save phone number
        </Button>
      </div>
    </form>
  )
}

function ProfileTab({ onSaved }) {
  const { user, setPictureVersion } = useAuth()
  const { data: profile, error, loading, reload } = useFetch((signal) => employeeSettingsApi.profile(signal), 'employee-settings-profile')

  if (!profile && loading) return <Spinner label="Loading your profile..." />
  if (!profile) {
    return (
      <div className="card">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  return (
    <div className="details-grid">
      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Your picture and phone</h3>
        </div>
        <div className="card__body form-stack">
          <ProfilePhotoEditor userId={user?.userId} name={user?.fullName} version={user?.pictureVersion} onChanged={setPictureVersion} />
          {/* key: the form starts again from the saved number */}
          <PhoneForm
            key={profile.phone ?? ''}
            profile={profile}
            onSaved={(message) => {
              onSaved(message)
              reload()
            }}
          />
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Your details</h3>
        </div>
        <dl className="card__body info-list">
          <InfoItem label="Name">{profile.fullName}</InfoItem>
          <InfoItem label="Email">{profile.email}</InfoItem>
          <InfoItem label="Employee ID">{profile.employeeId}</InfoItem>
          <InfoItem label="Joined">{profile.joiningDate ? formatDate(profile.joiningDate) : null}</InfoItem>
          <InfoItem label="Home organization">{profile.homeOrganization}</InfoItem>
          <InfoItem label="Working for">{profile.workingOrganization}</InfoItem>
          <InfoItem label="Skills">
            {profile.skills.length > 0 && (
              <span style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {profile.skills.map((skill) => (
                  <Badge key={skill.name} tone="info">
                    {skill.name} · {humanize(skill.proficiency)}
                  </Badge>
                ))}
              </span>
            )}
          </InfoItem>
        </dl>
        <p className="card__body cell-muted">Only the admin can change these. Ask the admin if something is wrong.</p>
      </section>
    </div>
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
      const result = await employeeSettingsApi.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
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
      <TextField label="New password" type="password" required autoComplete="new-password" {...field('newPassword')} />
      <TextField label="Confirm new password" type="password" required autoComplete="new-password" {...field('confirm')} />
      <div>
        <Button type="submit" loading={busy}>
          Change password
        </Button>
      </div>
    </form>
  )
}

function SecurityTab({ onSaved }) {
  const { data: security } = useFetch((signal) => employeeSettingsApi.security(signal), 'employee-settings-security')

  return (
    <div className="details-grid">
      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Change password</h3>
        </div>
        <div className="card__body">
          <PasswordForm onSaved={onSaved} />
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Sign-in</h3>
        </div>
        <dl className="card__body info-list">
          <InfoItem label="This sign-in started">{security?.signedInAt ? formatDateTime(security.signedInAt) : <span className="cell-muted">Not recorded</span>}</InfoItem>
          <InfoItem label="Previous sign-in">{security?.previousSignInAt ? formatDateTime(security.previousSignInAt) : <span className="cell-muted">None before this one</span>}</InfoItem>
        </dl>
      </section>
    </div>
  )
}

function NotificationsForm({ prefs, onSaved }) {
  const [inApp, setInApp] = useState(prefs.inApp)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await employeeSettingsApi.saveNotifications({ inApp })
      onSaved(result?.message || 'Your notification settings were saved.')
    } catch (problem) {
      setError(problem.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit} noValidate>
      {error && <Alert type="error">{error}</Alert>}
      {!prefs.systemInAppEnabled && <Alert type="info">The admin has switched notifications off for the whole system, so the bell stays hidden.</Alert>}
      <Checkbox label="Show the notification bell" checked={inApp} onChange={setInApp} />
      <p className="cell-muted">The bell tells you about your queries, shifts, allocations and changes to your account. When it is off, nothing is shown; you can switch it on again any time.</p>
      <div>
        <Button type="submit" loading={busy}>
          Save
        </Button>
      </div>
    </form>
  )
}

function NotificationsTab({ onSaved }) {
  const { data, error, loading, reload } = useFetch((signal) => employeeSettingsApi.notifications(signal), 'employee-settings-notifications')

  if (!data && loading) return <Spinner label="Loading..." />
  if (!data) {
    return (
      <div className="card">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  return (
    <section className="card">
      <div className="card__header">
        <h3 className="card__title">Notification bell</h3>
      </div>
      <div className="card__body">
        <NotificationsForm
          key={JSON.stringify(data)}
          prefs={data}
          onSaved={(message) => {
            onSaved(message)
            reload()
          }}
        />
      </div>
    </section>
  )
}

/** Employee: Settings (profile, security, notifications). */
function EmployeeSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = TABS.find((tab) => tab.id === searchParams.get('tab')) ?? TABS[0]
  const [notice, setNotice] = useFlashNotice()

  return (
    <div className="page">
      <PageHeader title="Settings" description={activeTab.description} />

      <div className="tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab.id}
            className={`tabs__tab ${tab.id === activeTab.id ? 'is-active' : ''}`}
            onClick={() => {
              setNotice('')
              setSearchParams({ tab: tab.id }, { replace: true })
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Notice message={notice} onClose={() => setNotice('')} />

      {activeTab.id === 'profile' && <ProfileTab onSaved={setNotice} />}
      {activeTab.id === 'security' && <SecurityTab onSaved={setNotice} />}
      {activeTab.id === 'notifications' && <NotificationsTab onSaved={setNotice} />}
    </div>
  )
}

export default EmployeeSettingsPage
