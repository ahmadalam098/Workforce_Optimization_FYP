import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useSystemPrefs } from '../../../context/useSystemPrefs.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { settingsApi } from '../../../services/admin/adminService.js'
import ProfileTab from './ProfileTab.jsx'
import RolesTab from './RolesTab.jsx'
import SettingsSection from './SettingsSection.jsx'
import Notice from '../shared/Notice.jsx'
import PageHeader from '../shared/PageHeader.jsx'
import { ErrorState } from '../shared/StateBox.jsx'

// `section` matches the section names sent by GET /api/admin/settings; tabs without one have their own content.
const TABS = [
  { id: 'general', label: 'General', section: 'General', description: 'Timezone, date and time style and language.' },
  { id: 'profile', label: 'Profile', description: 'Your name, email, picture and password.' },
  { id: 'users', label: 'Users & Roles', description: 'Roles, the accounts in each role, and account activation.' },
  { id: 'billing', label: 'Billing', section: 'Billing', description: 'The company details, bank details and wording printed on invoices, receipts and statements.' },
  { id: 'notifications', label: 'Notifications', section: 'Notifications', description: 'Email and in-app notifications, workforce alerts and contract expiry alerts.' },
]

/** System settings in tabs, plus the signed-in admin's own account. Every change is written to the audit log. */
function SettingsPage() {
  const { refresh } = useSystemPrefs()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = TABS.find((tab) => tab.id === searchParams.get('tab')) ?? TABS[0]

  const [notice, setNotice] = useFlashNotice()
  const [actionError, setActionError] = useState('')
  const { data, error, loading, reload } = useFetch((signal) => settingsApi.list(signal), 'settings')

  // The look of the whole portal depends on the General settings, so they are loaded again; the page
  // is shown again afterwards, and the message is carried over so it is not lost.
  function changed(message) {
    if (activeTab.id === 'general') {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: { message } })
      refresh()
      return
    }
    setNotice(message)
    reload()
  }


  const settingsReady = Boolean(data)

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
              setActionError('')
              setSearchParams({ tab: tab.id }, { replace: true })
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Notice message={notice} onClose={() => setNotice('')} />
      {actionError && <Alert type="error" onClose={() => setActionError('')}>{actionError}</Alert>}

      {activeTab.id === 'profile' && <ProfileTab onSaved={setNotice} />}
      {activeTab.id === 'users' && <RolesTab />}

      {activeTab.section &&
        (error && !data ? (
          <div className="card">
            <ErrorState error={error} onRetry={reload} />
          </div>
        ) : !settingsReady && loading ? (
          <Spinner label="Loading settings..." />
        ) : (
          <>
            <SettingsSection settings={data ?? []} section={activeTab.section} onChanged={changed} onError={setActionError} />

          </>
        ))}
    </div>
  )
}

export default SettingsPage
