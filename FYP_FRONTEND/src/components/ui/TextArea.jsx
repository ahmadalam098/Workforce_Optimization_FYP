import { useId } from 'react'
import './TextArea.css'

function TextArea({ label, error, hint, id, className = '', rows = 3, ...rest }) {
  const generatedId = useId()
  const areaId = id || generatedId
  const messageId = `${areaId}-message`

  return (
    <div className={`textarea-field ${error ? 'textarea-field--error' : ''} ${className}`}>
      <label className="textarea-field__label" htmlFor={areaId}>
        {label}
        {rest.required && <span className="field__required" aria-hidden="true"> *</span>}
      </label>
      <textarea
        id={areaId}
        className="textarea-field__input"
        rows={rows}
        maxLength={2000}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? messageId : undefined}
        {...rest}
      />
      {(error || hint) && (
        <p id={messageId} className={error ? 'textarea-field__error' : 'textarea-field__hint'} role={error ? 'alert' : undefined}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

export default TextArea
