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
  return (
    <div className="state-box state-box--error" role="alert">
      <span className="state-box__icon">
        <Icon name="alert" size={22} />
      </span>
      <h3 className="state-box__title">Could not load data</h3>
      <p className="state-box__text">{error?.message || 'Something went wrong. Please try again.'}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
