import './Spinner.css'

/** Loading indicator. `fullPage` centers it on the whole screen. */
function Spinner({ label = 'Loading...', fullPage = false, size = 28 }) {
  return (
    <div className={`spinner-wrap ${fullPage ? 'spinner-wrap--full' : ''}`} role="status" aria-live="polite">
      <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />
      <span className="spinner-label">{label}</span>
    </div>
  )
}

export default Spinner
