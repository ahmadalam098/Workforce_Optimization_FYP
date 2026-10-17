import { useEffect } from 'react'
import Alert from '../../../components/ui/Alert.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import CallContactList from '../../../components/calls/CallContactList.jsx'
import CallHistory from '../../../components/calls/CallHistory.jsx'
import { useCalls } from '../../../components/calls/callContext.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { callsApi } from '../../../services/calls/callsService.js'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { ErrorState } from '../../admin/shared/StateBox.jsx'

/**
 * Employee: voice and video calls with the organization you work for and with its manager. An organization can call you too (the call rings on
 * any page). The call screen is a dummy for now - no sound or picture - but the whole flow is real and WebRTC plugs in later.
 */
function EmployeeCallsPage() {
  const { me, tick } = useCalls()
  const { data: contacts, error, loading, reload } = useFetch((signal) => callsApi.contacts(signal), 'employee-call-contacts')
  const { data: history, reload: reloadHistory } = useFetch((signal) => callsApi.history(signal), 'employee-call-history')

  // A call ended or started somewhere: the history changes.
  useEffect(() => {
    if (tick > 0) reloadHistory()
  }, [tick, reloadHistory])

  return (
    <div className="page">
      <PageHeader title="Calls" description="Call the organization you work for, or its manager, by voice or video. They can call you too." />
      <Alert type="info">Calling is in preview: the calls ring and connect for real, but no sound or picture is sent yet. Real audio and video (WebRTC) will be added later.</Alert>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">People you can call</h3>
        </div>
        <div className="card__body">
          {error && !contacts ? (
            <ErrorState error={error} onRetry={reload} />
          ) : !contacts && loading ? (
            <Spinner label="Loading..." />
          ) : (
            <CallContactList contacts={contacts ?? []} emptyTitle="Nobody to call yet" emptyText="When you work for an organization (after you accept an assignment), it and its manager appear here." />
          )}
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Recent calls</h3>
        </div>
        <div className="card__body">
          <CallHistory calls={history ?? []} meKey={me?.key} />
        </div>
      </section>
    </div>
  )
}

export default EmployeeCallsPage
