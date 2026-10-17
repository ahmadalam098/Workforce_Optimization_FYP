import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import CallContactList from '../../../components/calls/CallContactList.jsx'
import CallHistory from '../../../components/calls/CallHistory.jsx'
import { useCalls } from '../../../components/calls/callContext.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { callsApi } from '../../../services/calls/callsService.js'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { ErrorState } from '../../admin/shared/StateBox.jsx'

const TABS = [
  { id: 'call', label: 'Call someone' },
  { id: 'history', label: 'My calls' },
]

/**
 * Organization Manager: call your employees and organizations yourself, and see your own calls. Watching the calls of your employees and
 * cutting one is done in Performance Monitoring. The media is a dummy for now.
 */
function ManagerCallsPage() {
  const { me, tick } = useCalls()
  const [tab, setTab] = useState('call')
  const { data: contacts, error, loading, reload } = useFetch((signal) => callsApi.contacts(signal), 'manager-call-contacts')
  const { data: mine, reload: reloadMine } = useFetch((signal) => callsApi.history(signal), 'manager-call-history')

  useEffect(() => {
    if (tick > 0) reloadMine()
  }, [tick, reloadMine])

  return (
    <div className="page">
      <PageHeader title="Calls" description="Call your employees and organizations by voice or video, and see your own calls." />
      <Alert type="info">
        Calling is in preview: the calls ring and connect for real, but no sound or picture is sent yet. To watch the calls of your employees and cut one, open <Link to="/manager/performance">Performance Monitoring</Link>.
      </Alert>

      <div className="tabs" role="tablist" aria-label="Calls">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`tabs__tab ${tab === item.id ? 'is-active' : ''}`} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      <section className="card">
        <div className="card__body">
          {tab === 'call' &&
            (error && !contacts ? (
              <ErrorState error={error} onRetry={reload} />
            ) : !contacts && loading ? (
              <Spinner label="Loading..." />
            ) : (
              <CallContactList contacts={contacts ?? []} emptyTitle="Nobody to call" emptyText="Employees working for, or belonging to, your organizations appear here." />
            ))}
          {tab === 'history' && <CallHistory calls={mine ?? []} meKey={me?.key} />}
        </div>
      </section>
    </div>
  )
}

export default ManagerCallsPage
