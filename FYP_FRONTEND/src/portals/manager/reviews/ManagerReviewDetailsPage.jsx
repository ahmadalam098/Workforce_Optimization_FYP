import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import ReviewList from '../../../components/reviews/ReviewList.jsx'
import { Stars } from '../../../components/reviews/Stars.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { managerReviewsApi } from '../../../services/manager/managerService.js'
import { formatDate, formatDateTime } from '../../../utils/format.js'
import DecisionModal from '../../admin/shared/DecisionModal.jsx'
import Notice from '../../admin/shared/Notice.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import { REVIEW_STATUS_TONES } from './reviewStatus.js'

function InfoItem({ label, children }) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd>{children || <span className="cell-muted">—</span>}</dd>
    </div>
  )
}

/** Organization Manager: one review, and what to do about it - warn the employee, ask the admin to act, or close it. */
function ManagerReviewDetailsPage() {
  const { reviewId } = useParams()
  const [notice, setNotice] = useFlashNotice()
  const [acting, setActing] = useState(null) // 'warn' | 'escalate' | 'dismiss'
  const { data: review, error, loading, reload } = useFetch((signal) => managerReviewsApi.get(reviewId, signal), `manager-review-${reviewId}`)

  const back = (
    <Link className="back-link" to="/manager/reviews">
      <Icon name="arrowLeft" size={16} /> Back to Employee Reviews
    </Link>
  )
  if (!review && loading) return <Spinner label="Loading the review..." />
  if (!review) {
    return (
      <div className="page">
        {back}
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      </div>
    )
  }

  const done = (message) => {
    setActing(null)
    setNotice(message)
    reload()
  }
  const esc = review.escalation

  return (
    <div className="page">
      {back}
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card hero-card">
        <div className="hero-card__main">
          <h2 className="hero-card__title">{review.employeeName}</h2>
          <p className="hero-card__sub">
            Reviewed by {review.orgName} on {review.date ? formatDate(review.date) : '—'}
          </p>
          <div className="hero-card__badges">
            <Stars value={review.rating} />
            <Badge tone={REVIEW_STATUS_TONES[review.status] ?? 'neutral'}>{review.status}</Badge>
            {review.isBad && <Badge tone="danger">Bad review</Badge>}
            {!review.employeeActive && <Badge tone="neutral">Employee deactivated</Badge>}
          </div>
        </div>
        {review.canAct && (
          <div className="hero-card__actions">
            <Button variant="secondary" onClick={() => setActing('warn')}>
              <Icon name="alert" size={17} /> Warn the employee
            </Button>
            <Button onClick={() => setActing('escalate')}>
              <Icon name="send" size={17} /> Ask the admin to act
            </Button>
            <Button variant="secondary" onClick={() => setActing('dismiss')}>
              No action needed
            </Button>
          </div>
        )}
      </section>

      {review.isBad && review.status === 'New' && <Alert type="warning">This is a bad review. Decide: warn the employee, or - if it is serious - ask the admin to take action (the admin can even deactivate the employee).</Alert>}
      {review.status === 'Warned' && <Alert type="info">You warned the employee. If it happens again you can still ask the admin to act.</Alert>}

      <div className="details-grid">
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">The review</h3>
          </div>
          <dl className="card__body info-list">
            <InfoItem label="Comment">{review.comment}</InfoItem>
            <InfoItem label="Employee's overall rating">{review.employeeRating != null ? <Stars value={review.employeeRating} /> : null}</InfoItem>
            {review.handledNote && <InfoItem label="Your last note">{review.handledNote}</InfoItem>}
          </dl>
          {esc && (
            <>
              <div className="card__header">
                <h3 className="card__title">Sent to the admin</h3>
              </div>
              <dl className="card__body info-list">
                <InfoItem label="Your message">{esc.note}</InfoItem>
                <InfoItem label="Asked on">{formatDateTime(esc.createdAt)}</InfoItem>
                <InfoItem label="Admin's decision">{esc.status === 'Pending' ? <Badge tone="warning">Waiting for the admin</Badge> : <Badge tone="success">{esc.adminAction}</Badge>}</InfoItem>
                {esc.adminResponse && <InfoItem label="Admin's comment">{esc.adminResponse}</InfoItem>}
              </dl>
            </>
          )}
        </section>

        <div className="form-stack">
          <section className="card">
            <div className="card__header">
              <h3 className="card__title">Other reviews of this employee</h3>
            </div>
            <div className="card__body">{review.otherReviews.length === 0 ? <EmptyState icon="inbox" title="None" text="No other review yet." /> : <ReviewList reviews={review.otherReviews} />}</div>
          </section>
          <section className="card">
            <div className="card__header">
              <h3 className="card__title">Warnings so far</h3>
            </div>
            {review.warnings.length === 0 ? (
              <div className="card__body">
                <EmptyState icon="checkCircle" title="No warnings" text="This employee has no warning on record." />
              </div>
            ) : (
              <ul className="card__body plain-list">
                {review.warnings.map((warning) => (
                  <li key={warning.warningId}>
                    <strong>{warning.issuedByRole}</strong> <span className="cell-muted">· {formatDateTime(warning.createdAt)}</span>
                    <p style={{ margin: '0.25rem 0 0' }}>{warning.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {acting === 'warn' && (
        <DecisionModal
          title="Warn the employee"
          description="The employee gets this message in their notifications and by email. It stays on their record."
          label="Warning message"
          required
          confirmLabel="Send warning"
          onSubmit={async (text) => done((await managerReviewsApi.warn(review.reviewId, text)).message)}
          onClose={() => setActing(null)}
        />
      )}
      {acting === 'escalate' && (
        <DecisionModal
          title="Ask the admin to act"
          description="Explain what happened. The admin decides - for example a warning, or deactivating the employee so they cannot sign in again."
          label="Your message to the admin"
          required
          danger
          confirmLabel="Send to the admin"
          onSubmit={async (text) => done((await managerReviewsApi.escalate(review.reviewId, text)).message)}
          onClose={() => setActing(null)}
        />
      )}
      {acting === 'dismiss' && (
        <DecisionModal
          title="No action needed"
          description="The review stays on the employee's record, but you take no action."
          label="Note (optional)"
          confirmLabel="Close the review"
          onSubmit={async (text) => done((await managerReviewsApi.dismiss(review.reviewId, text || undefined)).message)}
          onClose={() => setActing(null)}
        />
      )}
    </div>
  )
}

export default ManagerReviewDetailsPage
