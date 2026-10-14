import { useEffect, useId, useRef } from 'react'
import Icon from './Icon.jsx'
import { usePageMode } from './pageMode.js'
import './FormPage.css'
import './Modal.css'

/** Accessible dialog: Esc closes, focus moves inside, page scroll is locked while open. */
function Modal({ title, subtitle, onClose, children, footer, size = 'md', busy = false }) {
  const titleId = useId()
  const dialogRef = useRef(null)
  const pageMode = usePageMode()

  useEffect(() => {
    if (pageMode) return undefined
    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const firstField = dialogRef.current?.querySelector('input, select, textarea, button:not(.modal__close)')
    ;(firstField || dialogRef.current)?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [pageMode])

  function handleKeyDown(event) {
    if (event.key === 'Escape' && !busy) onClose()
  }

  if (pageMode) {
    return (
      <section className={`card form-page ${size === 'sm' ? 'form-page--sm' : ''}`} aria-labelledby={titleId}>
        <header className="form-page__header">
          <h2 id={titleId} className="form-page__title">
            {title}
          </h2>
          {subtitle && <p className="form-page__subtitle">{subtitle}</p>}
        </header>
        <div className="form-page__body">{children}</div>
        {footer && <footer className="form-page__footer">{footer}</footer>}
      </section>
    )
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div
        ref={dialogRef}
        className={`modal modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="modal__header">
          <div>
            <h2 id={titleId} className="modal__title">
              {title}
            </h2>
            {subtitle && <p className="modal__subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="modal__close" onClick={onClose} disabled={busy} aria-label="Close dialog">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>
  )
}

export default Modal
