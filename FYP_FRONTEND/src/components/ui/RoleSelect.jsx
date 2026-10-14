import { useEffect, useId, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import './RoleSelect.css'

/**
 * Accessible dropdown for choosing a login role.
 * options: [{ value, label, description, enabled }]
 * Disabled options are visible but cannot be selected ("Coming soon").
 */
function RoleSelect({ label, options, value, onChange, error, placeholder = 'Select your role' }) {
  const id = useId()
  const buttonId = `${id}-button`
  const listId = `${id}-list`
  const messageId = `${id}-message`
  const wrapperRef = useRef(null)
  const listRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const selected = options.find((option) => option.value === value)
  const enabledIndexes = options.map((option, index) => (option.enabled ? index : -1)).filter((i) => i >= 0)

  useEffect(() => {
    if (!open) return undefined
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    listRef.current?.focus()
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function openList() {
    const current = options.findIndex((option) => option.value === value)
    setActiveIndex(current >= 0 ? current : (enabledIndexes[0] ?? -1))
    setOpen(true)
  }

  function choose(option) {
    if (!option.enabled) return
    onChange(option.value)
    setOpen(false)
    document.getElementById(buttonId)?.focus()
  }

  function moveActive(step) {
    if (enabledIndexes.length === 0) return
    const position = enabledIndexes.indexOf(activeIndex)
    const next = position === -1 ? 0 : (position + step + enabledIndexes.length) % enabledIndexes.length
    setActiveIndex(enabledIndexes[next])
  }

  function handleButtonKeyDown(event) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      openList()
    }
  }

  function handleListKeyDown(event) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveActive(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveActive(-1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (options[activeIndex]) choose(options[activeIndex])
        break
      case 'Escape':
      case 'Tab':
        setOpen(false)
        if (event.key === 'Escape') document.getElementById(buttonId)?.focus()
        break
      default:
    }
  }

  return (
    <div className={`role-select ${error ? 'role-select--error' : ''}`} ref={wrapperRef}>
      <span className="role-select__label" id={`${id}-label`}>
        {label}
      </span>
      <button
        id={buttonId}
        type="button"
        className={`role-select__button ${open ? 'is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${id}-label ${buttonId}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? messageId : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleButtonKeyDown}
      >
        <Icon name="shield" size={18} className="role-select__lead" />
        <span className={selected ? 'role-select__value' : 'role-select__placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <Icon name="chevronDown" size={18} className="role-select__chevron" />
      </button>

      {open && (
        <ul
          id={listId}
          ref={listRef}
          className="role-select__list"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${id}-label`}
          aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
          onKeyDown={handleListKeyDown}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={option.value === value}
              aria-disabled={!option.enabled}
              className={[
                'role-select__option',
                index === activeIndex && 'is-active',
                option.value === value && 'is-selected',
                !option.enabled && 'is-disabled',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => option.enabled && setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              <span className="role-select__option-text">
                <span className="role-select__option-label">{option.label}</span>
                <span className="role-select__option-desc">{option.description}</span>
              </span>
              {option.enabled ? (
                option.value === value && <Icon name="check" size={16} className="role-select__check" />
              ) : (
                <span className="role-select__badge">Coming soon</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p id={messageId} className="role-select__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export default RoleSelect
