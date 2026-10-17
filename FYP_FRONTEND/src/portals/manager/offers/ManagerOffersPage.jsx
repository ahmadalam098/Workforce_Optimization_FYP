import { useState } from 'react'
import { Link } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { managerOffersApi } from '../../../services/manager/managerService.js'
import { formatTimeAgo } from '../../../utils/format.js'
import Notice from '../../admin/shared/Notice.jsx'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'

const TONES = { Pending: 'warning', Accepted: 'success', Declined: 'neutral', Cancelled: 'neutral', Expired: 'neutral', Failed: 'danger' }
const STATUSES = ['Pending', 'Accepted', 'Declined', 'Cancelled', 'Expired', 'Failed'].map((value) => ({ value, label: value }))

/** Organization Manager: the offers you sent to employees. They accept or decline in their portal; an accepted offer puts them on the organization's team. */
function ManagerOffersPage() {
  const [status, setStatus] = useState('')
  const [notice, setNotice] = useFlashNotice()
  const [problem, setProblem] = useState('')
  const { data, error, loading, reload } = useFetch((signal) => managerOffersApi.list(status, signal), `manager-offers-${status}`)
  const offers = data ?? []

  async function cancel(offer) {
    setProblem('')
    try {
      const result = await managerOffersApi.cancel(offer.offerId)
      setNotice(result?.message || 'Cancelled.')
      reload()
    } catch (err) {
      setProblem(err.message)
    }
  }

  return (
    <div className="page">
      <PageHeader title="Assignment Offers" description="Work you forwarded to employees from the pool. They accept or decline; when they accept they join the organization's team and appear online there." />
      <Notice message={notice} onClose={() => setNotice('')} />
      {problem && (
        <Alert type="error" onClose={() => setProblem('')}>
          {problem}
        </Alert>
      )}

      <section className="card">
        <div className="toolbar">
          <SelectField className="toolbar__filter" label="Status" value={status} onChange={(event) => setStatus(event.target.value)} options={STATUSES} placeholder="All" />
        </div>
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading..." />
        ) : offers.length === 0 ? (
          <EmptyState icon="send" title="No offers" text="Open a staff request or Minimum Staff and choose Send to employees." />
        ) : (
          <div className="table-wrap" aria-busy={loading}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>For</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {offers.map((offer) => (
                  <tr key={offer.offerId}>
                    <td>
                      <Link to={`/manager/employees/${offer.employeeId}`} className="person__name">
                        {offer.employeeName}
                      </Link>
                    </td>
                    <td>
                      {offer.orgName}
                      <span className="person__sub">
                        {offer.kind === 'Minimum' ? 'Minimum staff' : offer.requestId ? <Link to={`/manager/requests/${offer.requestId}`}>Staff request #{offer.requestId}</Link> : 'Staff request'}
                      </span>
                    </td>
                    <td>
                      <Badge tone={TONES[offer.status] ?? 'neutral'}>{offer.status}</Badge>
                      {offer.note && <span className="person__sub">{offer.note}</span>}
                    </td>
                    <td className="cell-muted">{formatTimeAgo(offer.createdAt)}</td>
                    <td>
                      {offer.status === 'Pending' && (
                        <Button variant="secondary" onClick={() => cancel(offer)}>
                          Cancel offer
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default ManagerOffersPage
