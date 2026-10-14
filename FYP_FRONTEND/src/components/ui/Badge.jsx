import './Badge.css'

/** tone: success | info | warning | danger | neutral | gold */
function Badge({ tone = 'neutral', children, dot = false }) {
  return (
    <span className={`badge badge--${tone}`}>
      {dot && <span className="badge__dot" aria-hidden="true" />}
      {children}
    </span>
  )
}

export default Badge
