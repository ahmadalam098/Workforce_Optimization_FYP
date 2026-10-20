import { Link } from 'react-router-dom'
import './Button.css'

/** A link that looks like a Button (variant: primary | secondary | ghost | link). */
function LinkButton({ to, variant = 'secondary', className = '', children, ...rest }) {
  return (
    <Link to={to} className={['btn', `btn--${variant}`, className].filter(Boolean).join(' ')} {...rest}>
      <span>{children}</span>
    </Link>
  )
}

export default LinkButton
