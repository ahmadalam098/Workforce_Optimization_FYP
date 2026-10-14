import { useId } from 'react'
import Icon from './Icon.jsx'
import './SelectField.css'

/** Native select with the same look as TextField. options: [{ value, label }] */
function SelectField({ label, options, error, hint, placeholder, id, className = '', hideLabel = false, ...selectProps }) {
  const generatedId = useId()
  const selectId = id || generatedId
  const messageId = `${selectId}-message`

  return (
    <div className={`select-field ${error ? 'select-field--error' : ''} ${className}`}>
      <label className={hideLabel ? 'visually-hidden' : 'select-field__label'} htmlFor={selectId}>
        {label}
        {selectProps.required && <span className="field__required" aria-hidden="true"> *</span>}
      </label>
      <div className="select-field__control">
        <select
          id={selectId}
          className="select-field__input"
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? messageId : undefined}
          {...selectProps}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={16} className="select-field__chevron" />
      </div>
      {(error || hint) && (
        <p id={messageId} className={error ? 'select-field__error' : 'select-field__hint'} role={error ? 'alert' : undefined}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

export default SelectField
