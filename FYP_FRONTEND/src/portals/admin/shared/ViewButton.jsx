import { Link } from 'react-router-dom'
import Icon from '../../../components/ui/Icon.jsx'

/**
 * The "View" button of the View column in the lists. With `to` it opens the details page of that row;
 * with `onClick` it opens a read-only details window. `label` tells screen readers what is being opened.
 */
function ViewButton({ to, onClick, label }) {
  const content = (
    <>
      <Icon name="eye" size={16} /> View
    </>
  )

  return to ? (
    <Link className="view-btn" to={to} aria-label={label}>
      {content}
    </Link>
  ) : (
    <button type="button" className="view-btn" onClick={onClick} aria-label={label}>
      {content}
    </button>
  )
}

export default ViewButton
