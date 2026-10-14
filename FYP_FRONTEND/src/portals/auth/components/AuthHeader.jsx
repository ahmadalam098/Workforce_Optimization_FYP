import Icon from '../../../components/ui/Icon.jsx'
import './AuthHeader.css'

function AuthHeader({ icon, title, subtitle }) {
  return (
    <header className="auth-header">
      {icon && (
        <span className="auth-header__icon">
          <Icon name={icon} size={22} />
        </span>
      )}
      <h2 className="auth-header__title">{title}</h2>
      {subtitle && <p className="auth-header__subtitle">{subtitle}</p>}
    </header>
  )
}

export default AuthHeader
