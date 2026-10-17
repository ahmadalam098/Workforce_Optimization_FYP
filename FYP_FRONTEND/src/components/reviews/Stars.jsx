/** Read-only stars for a rating from 1 to 5 (a decimal average is rounded to the nearest star). */
export function Stars({ value, showNumber = true }) {
  if (value === null || value === undefined) return <span className="cell-muted">No rating</span>
  const rounded = Math.round(Number(value))
  return (
    <span aria-label={`${Number(value).toFixed(1)} out of 5`} style={{ whiteSpace: 'nowrap' }}>
      <span style={{ color: 'var(--gold-500, #d99a00)', letterSpacing: '0.05em' }}>
        {'★'.repeat(rounded)}
        <span style={{ color: 'var(--gray-300, #cfc8b8)' }}>{'★'.repeat(5 - rounded)}</span>
      </span>
      {showNumber && <span className="cell-muted"> {Number(value).toFixed(1)}</span>}
    </span>
  )
}

/** Clickable stars for giving a rating. */
export function StarInput({ value, onChange, label = 'Rating' }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: '0.25rem' }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          onClick={() => onChange(star)}
          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: '1.9rem', lineHeight: 1, color: star <= value ? 'var(--gold-500, #d99a00)' : 'var(--gray-300, #cfc8b8)' }}
        >
          ★
        </button>
      ))}
    </div>
  )
}
