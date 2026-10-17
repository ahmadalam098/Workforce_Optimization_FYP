import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Checkbox from '../../../components/ui/Checkbox.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useAuth } from '../../../context/useAuth.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { organizationSettingsApi } from '../../../services/organization/organizationService.js'
import { formatDate, formatDateTime } from '../../../utils/format.js'
import { onlyErrors, validateAddress, validateConfirmPassword, validateCountry, validateInteger, validateNewPassword, validatePhone, validateText } from '../../../utils/validators.js'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { ErrorState } from '../../admin/shared/StateBox.jsx'

const TABS = [
  { id: 'profile', label: 'Profile', description: 'Your company details. The name and email can only be changed by the admin.' },
  { id: 'security', label: 'Security', description: 'Change your password and see when you signed in.' },
  { id: 'notifications', label: 'Notifications', description: 'Choose what appears in your notification bell.' },
]

function InfoItem({ label, children }) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd>{children || <span className="cell-muted">—</span>}</dd>
    </div>
  )
}

function ProfileForm({ profile, onSaved }) {
  const { form, field, checkAll, addServerErrors } = useFormFields(
    { phone: profile.phone ?? '', country: profile.country ?? '', address: profile.address ?? '' },
    (values) => onlyErrors({ phone: validatePhone(values.phone, { required: true }), country: validateCountry(values.country, { required: true }), address: validateAddress(values.address, { required: true }) }),
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
      const result = await organizationSettingsApi.updateProfile({ phone: form.phone.trim(), country: form.country.trim(), address: form.address.trim() })
      onSaved(result?.message || 'Your details were saved.')
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
      <TextField label="Phone" type="tel" required maxLength={20} autoComplete="tel" {...field('phone')} />
      <TextField label="Country" required maxLength={100} autoComplete="country-name" {...field('country')} />
      <TextArea label="Address" required rows={3} maxLength={255} {...field('address')} />
      <div>
        <Button type="submit" loading={busy}>
          Save details
        </Button>
      </div>
    </form>
  )
}

function ProfileTab({ onSaved }) {
  const { data: profile, error, loading, reload } = useFetch((signal) => organizationSettingsApi.profile(signal), 'organization-settings-profile')
  if (!profile && loading) return <Spinner label="Loading your details..." />
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
          <h3 className="card__title">Contact details</h3>
        </div>
        <div className="card__body">
          <ProfileForm key={`${profile.phone}|${profile.country}|${profile.address}`} profile={profile} onSaved={(message) => { onSaved(message); reload() }} />
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Your organization</h3>
        </div>
        <dl className="card__body info-list">
          <InfoItem label="Name">{profile.name}</InfoItem>
          <InfoItem label="Email (you sign in with it)">{profile.email}</InfoItem>
          <InfoItem label="Status">
            <Badge tone={profile.status === 'Active' || profile.status === 'Approved' ? 'success' : 'neutral'}>{profile.status || 'Unknown'}</Badge>
          </InfoItem>
          <InfoItem label="Registered">{profile.registeredAt ? formatDate(profile.registeredAt) : null}</InfoItem>
          <InfoItem label="Approved">{profile.approvedAt ? formatDate(profile.approvedAt) : null}</InfoItem>
        </dl>
        <p className="cell-muted card__body">These can only be changed by the admin. Contact them if something is wrong.</p>
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
      const result = await organizationSettingsApi.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
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
  const { data: security } = useFetch((signal) => organizationSettingsApi.security(signal), 'organization-settings-security')

  async function handleLogout() {
    setSigningOut(true)
    await logout()
    navigate('/organization/login', { replace: true })
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
            <InfoItem label="This sign-in started">{security?.signedInAt ? formatDateTime(security.signedInAt) : null}</InfoItem>
            <InfoItem label="Previous sign-in">{security?.previousSignInAt ? formatDateTime(security.previousSignInAt) : null}</InfoItem>
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
  ['contracts', 'Contracts', 'The admin approves or rejects your organization or a contract, or a contract change.'],
  ['requests', 'Staff requests', 'Your manager approves or rejects a request for extra employees.'],
  ['employees', 'Employees', 'An employee starts or stops working for you.'],
  ['invoices', 'Invoices and payments', 'An invoice is issued or cancelled, a payment is recorded, or an invoice is overdue.'],
  ['chat', 'Chat messages', 'New messages from your manager.'],
  ['expiry', 'Contract expiry', 'A contract of yours is about to end.'],
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
      const result = await organizationSettingsApi.saveNotifications({
        inApp: draft.inApp,
        contracts: draft.contracts,
        requests: draft.requests,
        employees: draft.employees,
        invoices: draft.invoices,
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
  const { data, error, loading, reload } = useFetch((signal) => organizationSettingsApi.notifications(signal), 'organization-settings-notifications')
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

/** Organization: Settings - company details, password and sign-in, and the notification bell. */
function OrganizationSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [notice, setNotice] = useFlashNotice()
  const activeTab = TABS.find((tab) => tab.id === searchParams.get('tab')) ?? TABS[0]
  const Tab = { profile: ProfileTab, security: SecurityTab, notifications: NotificationsTab }[activeTab.id]

  return (
    <div className="page">
      <PageHeader title="Settings" description={activeTab.description} />
      <Notice message={notice} onClose={() => setNotice('')} />
      <div className="tabs" role="tablist" aria-label="Settings">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab.id}
            className={`tabs__tab ${tab.id === activeTab.id ? 'is-active' : ''}`}
            onClick={() => setSearchParams({ tab: tab.id }, { replace: true })}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <Tab onSaved={setNotice} />
    </div>
  )
}

export default OrganizationSettingsPage
