import Icon from './Icon.jsx'
import './Alert.css'

const ICONS = { error: 'alert', success: 'checkCircle', info: 'info' }

/** type: error | success | info */
function Alert({ type = 'info', children, onClose }) {
  if (!children) return null
  return (
    <div className={`alert alert--${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <Icon name={ICONS[type]} size={18} className="alert__icon" />
      <div className="alert__body">{children}</div>
      {onClose && (
        <button type="button" className="alert__close" onClick={onClose} aria-label="Dismiss message">
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  )
}

export default Alert
