import { useState } from 'react'
import Avatar from '../../../components/ui/Avatar.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { Stars } from '../../../components/reviews/Stars.jsx'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { managerReviewsApi } from '../../../services/manager/managerService.js'
import { formatDate } from '../../../utils/format.js'
import '../../admin/finance/FinanceTiles.css'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import ViewButton from '../../admin/shared/ViewButton.jsx'

import { REVIEW_STATUS_TONES } from './reviewStatus.js'

const PAGE_SIZE = 10

const STATUS_OPTIONS = ['New', 'Warned', 'Escalated', 'Dismissed', 'Resolved'].map((value) => ({ value, label: value }))

/** Organization Manager: the reviews your organizations gave to the employees. Bad ones need your action (warn, or ask the admin). */
function ManagerReviewsPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [bad, setBad] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebouncedValue(search)
  const params = { search: debounced.trim(), status, bad: bad || undefined, page, pageSize: PAGE_SIZE }
  const { data, error, loading, reload } = useFetch((signal) => managerReviewsApi.list(params, signal), JSON.stringify(params))
  const { data: summary } = useFetch((signal) => managerReviewsApi.summary(signal), 'manager-review-summary')
  const items = data?.items ?? []

  const change = (setter) => (event) => {
    setter(event.target.value)
    setPage(1)
  }

  return (
    <div className="page">
      <PageHeader title="Employee Reviews" description="What your organizations think of the employees working for them. A bad review needs your decision: warn the employee, or - if it is serious - send it to the admin." />

      {summary && (
        <section className="finance-tiles" aria-label="Overview">
          <article className={`card finance-tile ${summary.badToHandle > 0 ? 'finance-tile--gold' : ''}`}>
            <p className="finance-tile__label">Bad reviews to handle</p>
            <p className="finance-tile__value">{summary.badToHandle}</p>
            <p className="finance-tile__caption">need your action</p>
          </article>
          <article className="card finance-tile">
            <p className="finance-tile__label">Warned</p>
            <p className="finance-tile__value">{summary.warned}</p>
          </article>
          <article className="card finance-tile">
            <p className="finance-tile__label">Sent to the admin</p>
            <p className="finance-tile__value">{summary.escalated}</p>
          </article>
          <article className="card finance-tile">
            <p className="finance-tile__label">All reviews</p>
            <p className="finance-tile__value">{summary.total}</p>
            <p className="finance-tile__caption">{summary.average != null ? `average ${Number(summary.average).toFixed(1)} / 5` : 'none yet'}</p>
          </article>
        </section>
      )}

      <section className="card">
        <div className="toolbar">
          <TextField className="toolbar__search" label="Search reviews" icon="search" placeholder="Employee name or comment" value={search} onChange={change(setSearch)} />
          <SelectField className="toolbar__filter" label="Status" value={status} onChange={change(setStatus)} options={STATUS_OPTIONS} placeholder="All statuses" />
          <SelectField className="toolbar__filter" label="Rating" value={bad} onChange={change(setBad)} options={[{ value: 'true', label: 'Bad reviews only (1-2 stars)' }]} placeholder="All ratings" />
        </div>
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading reviews..." />
        ) : items.length === 0 ? (
          <EmptyState icon="inbox" title="No reviews" text={search || status || bad ? 'Nothing matches the filters.' : 'Your organizations have not reviewed any employee yet.'} />
        ) : (
          <>
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Organization</th>
                    <th>Rating</th>
                    <th>Comment</th>
                    <th>Status</th>
                    <th>View</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((review) => (
                    <tr key={review.reviewId}>
                      <td>
                        <div className="person">
                          <Avatar userId={review.userId} name={review.employeeName} hasPicture={review.hasPicture} />
                          <span>
                            <strong className="person__name">{review.employeeName}</strong>
                            <span className="person__sub">{review.date ? formatDate(review.date) : ''}</span>
                          </span>
                        </div>
                      </td>
                      <td>{review.orgName}</td>
                      <td>
                        <Stars value={review.rating} />
                      </td>
                      <td style={{ maxWidth: '22rem' }}>{review.comment}</td>
                      <td>
                        <Badge tone={REVIEW_STATUS_TONES[review.status] ?? 'neutral'}>{review.status}</Badge>
                        {review.isBad && review.status === 'New' && <span className="person__sub">needs action</span>}
                      </td>
                      <td>
                        <ViewButton to={`/manager/reviews/${review.reviewId}`} label={`View review of ${review.employeeName}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </section>
    </div>
  )
}

export default ManagerReviewsPage
