import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { managerSettingsApi } from '../../../services/manager/managerService.js'
import { formatDateTime } from '../../../utils/format.js'
import {
  onlyErrors,
  validateConfirmPassword,
  validateInteger,
  validateNewPassword,
  validatePersonName,
  validatePhone,
  validateText,
} from '../../../utils/validators.js'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { ErrorState } from '../../admin/shared/StateBox.jsx'

const TABS = [
  { id: 'profile', label: 'Profile', description: 'Your name, phone, picture and the organizations you manage.' },
  { id: 'security', label: 'Security', description: 'Change your password and see when you signed in.' },
  { id: 'notifications', label: 'Notifications', description: 'Choose what appears in your notification bell.' },
]

function ProfileForm({ profile, onSaved }) {
  const { updateUser } = useAuth()
  const { form, field, checkAll, addServerErrors } = useFormFields(
    { fullName: profile.fullName ?? '', phone: profile.phone ?? '' },
    (values) => onlyErrors({ fullName: validatePersonName(values.fullName), phone: validatePhone(values.phone) }),
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
      const result = await managerSettingsApi.updateProfile({ fullName: form.fullName.trim(), phone: form.phone.trim() })
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
      <TextField label="Phone" type="tel" maxLength={20} autoComplete="tel" hint="Optional." {...field('phone')} />
      <TextField label="Email" value={profile.email ?? ''} readOnly hint="You sign in with this email. Only the admin can change it." onChange={() => {}} />
      <div>
        <Button type="submit" loading={busy}>
          Save profile
        </Button>
      </div>
    </form>
  )
}

function ProfileTab({ onSaved }) {
  const { user, setPictureVersion } = useAuth()
  const { data: profile, error, loading, reload } = useFetch((signal) => managerSettingsApi.profile(signal), 'manager-settings-profile')

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
          <h3 className="card__title">Your details</h3>
        </div>
        <div className="card__body form-stack">
          <ProfilePhotoEditor userId={user?.userId} name={user?.fullName} version={user?.pictureVersion} onChanged={setPictureVersion} />
          {/* key: the form starts again from the saved values */}
          <ProfileForm key={`${profile.fullName}|${profile.phone}`} profile={profile} onSaved={(message) => { onSaved(message); reload() }} />
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Organizations you manage</h3>
        </div>
        <div className="card__body">
          {profile.organizations.length === 0 ? (
            <p className="cell-muted">The admin has not assigned an organization to you yet.</p>
          ) : (
            <ul className="plain-list">
              {profile.organizations.map((org) => (
                <li key={org.organizationId}>
                  <strong>{org.name}</strong> <Badge tone={org.status === 'Active' ? 'success' : 'neutral'}>{org.status || 'Unknown'}</Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="cell-muted">Only the admin can change this list.</p>
        </div>
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
      const result = await managerSettingsApi.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
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
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const { data: security } = useFetch((signal) => managerSettingsApi.security(signal), 'manager-settings-security')

  async function handleLogout() {
    setSigningOut(true)
    await logout()
    navigate('/login', { replace: true })
  }

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
        <div className="card__body form-stack">
          <dl className="info-list">
            <div className="info-item">
              <dt>This sign-in started</dt>
              <dd>{security?.signedInAt ? formatDateTime(security.signedInAt) : <span className="cell-muted">Not recorded</span>}</dd>
            </div>
            <div className="info-item">
              <dt>Previous sign-in</dt>
              <dd>{security?.previousSignInAt ? formatDateTime(security.previousSignInAt) : <span className="cell-muted">None before this one</span>}</dd>
            </div>
          </dl>
          <p className="cell-muted">If you use a shared computer, sign out when you are done.</p>
          <div>
            <Button variant="secondary" onClick={handleLogout} loading={signingOut}>
              Sign out of this device
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

const CATEGORIES = [
  ['requests', 'Staff requests', 'New, approved, rejected or cancelled requests of your organizations.'],
  ['queries', 'Queries and complaints', 'New ones, and when the admin or you resolve one.'],
  ['invoices', 'Invoices and payments', 'An invoice is issued or cancelled, or a payment is recorded.'],
  ['employees', 'Employees', 'Allocations, changes to your employees, shifts and skills.'],
  ['chat', 'Chat messages', 'New messages from your organizations.'],
  ['expiry', 'Contract expiry', 'A contract of your organizations is about to end.'],
]

function NotificationsForm({ prefs, onSaved }) {
  const [draft, setDraft] = useState({ ...prefs, expiryDays: prefs.expiryDays == null ? '' : String(prefs.expiryDays) })
  const [daysError, setDaysError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key) => (value) => setDraft((current) => ({ ...current, [key]: value }))

  async function handleSubmit(event) {
    event.preventDefault()
    const days = draft.expiryDays.trim()
    const problem = days ? validateInteger(days, { label: 'The number of days', min: 1, max: 365 }) : ''
    setDaysError(problem)
    if (problem) return
    setBusy(true)
    setError('')
    try {
      const result = await managerSettingsApi.saveNotifications({
        inApp: draft.inApp,
        requests: draft.requests,
        queries: draft.queries,
        invoices: draft.invoices,
        employees: draft.employees,
        chat: draft.chat,
        expiry: draft.expiry,
        expiryDays: days ? Number(days) : null,
      })
      onSaved(result?.message || 'Your notification settings were saved.')
    } catch (problemFound) {
      setError(problemFound.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit} noValidate>
      {error && <Alert type="error">{error}</Alert>}
      {!prefs.systemInAppEnabled && <Alert type="info">The admin has switched notifications off for the whole system, so the bell stays hidden.</Alert>}
      <Checkbox label="Show the notification bell" checked={draft.inApp} onChange={set('inApp')} />
      <fieldset className="form-stack" disabled={!draft.inApp} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field__label">Tell me about</legend>
        {CATEGORIES.map(([key, label, hint]) => (
          <div key={key}>
            <Checkbox label={label} checked={draft[key]} onChange={set(key)} />
            <p className="cell-muted" style={{ margin: '0 0 0 2rem' }}>{hint}</p>
          </div>
        ))}
        <TextField
          label="Warn before a contract ends (days)"
          inputMode="numeric"
          maxLength={3}
          disabled={!draft.expiry}
          hint={`Leave empty to use the system value (${prefs.systemExpiryDays} days). Allowed 1 – 365.`}
          value={draft.expiryDays}
          onChange={(event) => set('expiryDays')(event.target.value.replace(/\D/g, ''))}
          error={daysError}
        />
      </fieldset>
      <div>
        <Button type="submit" loading={busy}>
          Save notification settings
        </Button>
      </div>
    </form>
  )
}

function NotificationsTab({ onSaved }) {
  const { data, error, loading, reload } = useFetch((signal) => managerSettingsApi.notifications(signal), 'manager-settings-notifications')

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

/** Organization Manager: Settings (profile, security, notifications). */
function ManagerSettingsPage() {
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

export default ManagerSettingsPage
