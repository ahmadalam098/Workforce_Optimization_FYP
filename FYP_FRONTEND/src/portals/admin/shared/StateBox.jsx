import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'

/** Empty and error placeholders for lists and cards. */
export function EmptyState({ icon = 'inbox', title, text, action }) {
  return (
    <div className="state-box">
      <span className="state-box__icon">
        <Icon name={icon} size={22} />
      </span>
      <h3 className="state-box__title">{title}</h3>
      {text && <p className="state-box__text">{text}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  // A missing item (or one that belongs to someone else) is not a failure to retry: say so plainly.
  const missing = error?.status === 404
  const denied = error?.status === 403
  const title = missing ? 'Not found' : denied ? 'No access' : 'Could not load data'
  return (
    <div className="state-box state-box--error" role="alert">
      <span className="state-box__icon">
        <Icon name="alert" size={22} />
      </span>
      <h3 className="state-box__title">{title}</h3>
      <p className="state-box__text">{error?.message || 'Something went wrong. Please try again.'}</p>
      {onRetry && !missing && !denied && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
