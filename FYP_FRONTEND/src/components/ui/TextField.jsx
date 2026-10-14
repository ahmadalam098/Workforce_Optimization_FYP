import { useId, useState } from 'react'
import Icon from './Icon.jsx'
import './TextField.css'

/** Labeled input with optional leading icon, error text and show/hide toggle for passwords. */
const LIMITED_TYPES = ['text', 'search', 'email', 'tel', 'url', 'password']

function TextField({ label, error, hint, icon, type = 'text', id, className = '', inputClassName = '', ...inputProps }) {
  const generatedId = useId()
  const inputId = id || generatedId
  const messageId = `${inputId}-message`
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'

  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`}>
      <label className="field__label" htmlFor={inputId}>
        {label}
        {inputProps.required && <span className="field__required" aria-hidden="true"> *</span>}
      </label>
      <div className="field__control">
        {icon && <Icon name={icon} size={18} className="field__icon" />}
        <input
          id={inputId}
          className={`field__input ${icon ? 'field__input--with-icon' : ''} ${isPassword ? 'field__input--with-toggle' : ''} ${inputClassName}`}
          type={isPassword && showPassword ? 'text' : type}
          maxLength={LIMITED_TYPES.includes(type) ? 255 : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? messageId : undefined}
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            className="field__toggle"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
          </button>
        )}
      </div>
      {(error || hint) && (
        <p id={messageId} className={error ? 'field__error' : 'field__hint'} role={error ? 'alert' : undefined}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

export default TextField
