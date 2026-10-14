import { useId } from 'react'
import Icon from './Icon.jsx'
import './Checkbox.css'

function Checkbox({ label, checked, onChange, id, ...rest }) {
  const generatedId = useId()
  const inputId = id || generatedId

  return (
    <label className="checkbox" htmlFor={inputId}>
      <input
        id={inputId}
        type="checkbox"
        className="checkbox__input"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        {...rest}
      />
      <span className="checkbox__box" aria-hidden="true">
        <Icon name="check" size={14} />
      </span>
      <span className="checkbox__label">{label}</span>
    </label>
  )
}

export default Checkbox
