import { useEffect } from 'react'
import Spinner from '../../../components/ui/Spinner.jsx'
import CallContactList from '../../../components/calls/CallContactList.jsx'
import ServeNowPanel from '../../../components/calls/ServeNowPanel.jsx'
import CallHistory from '../../../components/calls/CallHistory.jsx'
import { useCalls } from '../../../components/calls/callContext.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { callsApi } from '../../../services/calls/callsService.js'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { ErrorState } from '../../admin/shared/StateBox.jsx'

/**
 * Employee: voice and video calls with the organization you work for and with its manager. An organization can call you too (the call rings on
 * any page). Real WebRTC: the "Serving now" panel turns the video on towards each organization I am allocated to.
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
      

      <ServeNowPanel organizations={(contacts ?? []).filter((contact) => contact.type === 'Organization')} />

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
