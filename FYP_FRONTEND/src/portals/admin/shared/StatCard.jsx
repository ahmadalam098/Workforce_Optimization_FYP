import { Link } from 'react-router-dom'
import Icon from '../../../components/ui/Icon.jsx'
import { formatNumber } from '../../../utils/format.js'

/** A number with a label on a dashboard (same card in the Admin and Organization Manager portals). `to` makes it a link. `valueText` shows a ready-made text (for example money) instead of the number. */
function StatCard({ label, value, valueText, caption, icon, to }) {
  const content = (
    <>
      <div className="stat-card__top">
        <span className="stat-card__label">{label}</span>
        <span className="stat-card__icon" aria-hidden="true">
          <Icon name={icon} size={18} />
        </span>
      </div>
      <p className={`stat-card__value ${valueText ? "stat-card__value--text" : ""}`}>{valueText ?? formatNumber(value)}</p>
      <p className="stat-card__caption">{caption}</p>
    </>
  )
  return to ? (
    <Link to={to} className="card stat-card stat-card--link">
      {content}
    </Link>
  ) : (
    <article className="card stat-card">{content}</article>
  )
}

export default StatCard
