import Icon from './Icon.jsx'
import './Pagination.css'

function Pagination({ page, pageSize, total, onChange }) {
  if (!total) return null
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <nav className="pagination" aria-label="Pagination">
      <p className="pagination__summary">
        Showing <strong>{first}</strong>–<strong>{last}</strong> of <strong>{total}</strong>
      </p>
      <div className="pagination__buttons">
        <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <Icon name="chevronLeft" size={16} />
        </button>
        <span className="pagination__page">
          Page {page} of {totalPages}
        </span>
        <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label="Next page">
          <Icon name="chevronRight" size={16} />
        </button>
      </div>
    </nav>
  )
}

export default Pagination
