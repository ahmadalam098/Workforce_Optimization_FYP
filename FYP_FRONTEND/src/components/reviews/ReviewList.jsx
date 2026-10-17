import Badge from '../ui/Badge.jsx'
import { formatDate } from '../../utils/format.js'
import { Stars } from './Stars.jsx'

/** The reviews of an employee: who gave it, the stars, the comment and the date. */
function ReviewList({ reviews }) {
  return (
    <ul className="plain-list">
      {reviews.map((review) => (
        <li key={review.reviewId}>
          <strong>{review.organizationName || 'Organization'}</strong> {review.mine && <Badge tone="gold">Yours</Badge>} <Stars value={review.rating} />{' '}
          <span className="cell-muted">· {review.date ? formatDate(review.date) : ''}</span>
          <p style={{ margin: '0.25rem 0 0' }}>{review.comment}</p>
        </li>
      ))}
    </ul>
  )
}

export default ReviewList
