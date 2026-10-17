import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Avatar from '../../../components/ui/Avatar.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import ReviewList from '../../../components/reviews/ReviewList.jsx'
import { StarInput, Stars } from '../../../components/reviews/Stars.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { organizationEmployeesApi } from '../../../services/organization/organizationService.js'
import { formatDate } from '../../../utils/format.js'
import { validateText } from '../../../utils/validators.js'
import { AvailabilityBadge } from '../../admin/shared/StatusBadge.jsx'
import Notice from '../../admin/shared/Notice.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'

function InfoItem({ label, children }) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd>{children || <span className="cell-muted">—</span>}</dd>
    </div>
  )
}

function ReviewModal({ employee, onClose, onDone }) {
  const open = employee.periods.filter((period) => !period.reviewed)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [allocationId, setAllocationId] = useState(String(open[0]?.allocationId ?? ''))
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const periodOptions = open.map((period) => ({
    value: String(period.allocationId),
    label: `${period.start ? formatDate(period.start) : '—'} – ${period.working ? 'now' : period.end ? formatDate(period.end) : '—'}`,
  }))

  async function submit(event) {
    event.preventDefault()
    const next = { rating: rating ? '' : 'Choose 1 to 5 stars.', comment: validateText(comment, { label: 'The comment', min: 5, max: 500 }) }
    setErrors(next)
    if (next.rating || next.comment) return
    setSubmitting(true)
    setServerError('')
    try {
      const result = await organizationEmployeesApi.review(employee.employeeId, { rating, comment: comment.trim(), allocationId: allocationId ? Number(allocationId) : undefined })
      onDone(result?.message || 'Review sent.')
    } catch (problem) {
      setServerError(problem.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Review ${employee.fullName}`}
      subtitle="Be fair and specific. Your manager sees this review and acts on bad ones."
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="review-form" loading={submitting}>
            Submit review
          </Button>
        </>
      }
    >
      <form id="review-form" onSubmit={submit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        {periodOptions.length > 1 && <SelectField label="Period of work" options={periodOptions} value={allocationId} onChange={(event) => setAllocationId(event.target.value)} />}
        <div>
          <p className="term-group__title">Rating</p>
          <StarInput value={rating} onChange={setRating} />
          {errors.rating && <p className="field-error" role="alert">{errors.rating}</p>}
        </div>
        <TextArea label="Comment" required rows={4} maxLength={500} placeholder="How did this employee work for you?" value={comment} onChange={(event) => setComment(event.target.value)} error={errors.comment} />
      </form>
    </Modal>
  )
}

/** Organization: one employee - their information, the reviews every organization gave, and your own review. */
function OrganizationEmployeeDetailsPage() {
  const { employeeId } = useParams()
  const [notice, setNotice] = useFlashNotice()
  const [reviewing, setReviewing] = useState(false)
  const { data: employee, error, loading, reload } = useFetch((signal) => organizationEmployeesApi.get(employeeId, signal), `organization-employee-${employeeId}`)

  const back = (
    <Link className="back-link" to="/organization/employees">
      <Icon name="arrowLeft" size={16} /> Back to Employees
    </Link>
  )
  if (!employee && loading) return <Spinner label="Loading the employee..." />
  if (!employee) {
    return (
      <div className="page">
        {back}
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {back}
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card hero-card">
        <div className="hero-card__main" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Avatar userId={employee.userId} name={employee.fullName} hasPicture={employee.hasPicture} />
          <div>
            <h2 className="hero-card__title">{employee.fullName}</h2>
            <p className="hero-card__sub">
              <Stars value={employee.rating} /> · {employee.reviewCount} review{employee.reviewCount === 1 ? '' : 's'} from all organizations
            </p>
            <div className="hero-card__badges">
              <AvailabilityBadge status={employee.availabilityStatus} />
              {!employee.isActive && <Badge tone="neutral">Inactive</Badge>}
            </div>
          </div>
        </div>
        <div className="hero-card__actions">
          <Button onClick={() => setReviewing(true)} disabled={!employee.canReview}>
            <Icon name="edit" size={17} /> Review this employee
          </Button>
        </div>
      </section>
      {!employee.canReview && <Alert type="info">You have reviewed every period this employee worked for you. You can review again after they work for you next time.</Alert>}

      <div className="details-grid">
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Information</h3>
          </div>
          <dl className="card__body info-list">
            <InfoItem label="Home organization">{employee.homeOrgName || 'Central pool'}</InfoItem>
            <InfoItem label="Joined">{employee.joiningDate ? formatDate(employee.joiningDate) : null}</InfoItem>
            <InfoItem label="Skills">{employee.skills.length > 0 ? employee.skills.join(', ') : null}</InfoItem>
          </dl>
          <div className="card__header">
            <h3 className="card__title">Time with you</h3>
          </div>
          <ul className="card__body plain-list">
            {employee.periods.map((period) => (
              <li key={period.allocationId}>
                {period.start ? formatDate(period.start) : '—'} – {period.working ? 'now' : period.end ? formatDate(period.end) : '—'}{' '}
                {period.reviewed ? <Badge tone="success">Reviewed</Badge> : <Badge tone="warning">Not reviewed</Badge>}
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Reviews from organizations</h3>
          </div>
          <div className="card__body">
            {employee.reviews.length === 0 ? <EmptyState icon="inbox" title="No reviews yet" text="Be the first to review this employee." /> : <ReviewList reviews={employee.reviews} />}
          </div>
        </section>
      </div>

      {reviewing && (
        <ReviewModal
          employee={employee}
          onClose={() => setReviewing(false)}
          onDone={(message) => {
            setReviewing(false)
            setNotice(message)
            reload()
          }}
        />
      )}
    </div>
  )
}

export default OrganizationEmployeeDetailsPage
