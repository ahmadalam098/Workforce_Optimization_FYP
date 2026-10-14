import { APP_NAME, APP_TAGLINE } from '../../config/env.js'
import './Logo.css'

/** tone: light (on navy backgrounds) | dark (on light backgrounds) */
/** name / logoUrl: the system name and logo chosen in Settings (defaults to the built-in ones). */
function Logo({ tone = 'light', showTagline = true, compact = false, name = APP_NAME, logoUrl = '' }) {
  const customName = name && name !== APP_NAME
  return (
    <div className={`logo logo--${tone} ${compact ? 'logo--compact' : ''}`}>
      {logoUrl ? (
        <img className="logo__mark logo__mark--image" src={logoUrl} alt="" />
      ) : (
      <svg className="logo__mark" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="11" r="5.5" fill="#F2B705" />
        <circle cx="8.5" cy="15" r="4.2" fill="#F7C948" />
        <circle cx="31.5" cy="15" r="4.2" fill="#F7C948" />
        <path d="M10 33c0-6 4.5-10.5 10-10.5S30 27 30 33z" fill="#F2B705" />
        <path d="M1.5 31c0-4.6 3.1-8 7-8 1.6 0 3 .5 4.2 1.4A13 13 0 0 0 8.4 31z" fill="#F7C948" />
        <path d="M38.5 31c0-4.6-3.1-8-7-8-1.6 0-3 .5-4.2 1.4A13 13 0 0 1 31.6 31z" fill="#F7C948" />
      </svg>
      )}
      <div className="logo__text">
        <span className="logo__name">
          {customName ? name : <>WorkForce<span className="logo__accent">Nexus</span></>}
        </span>
        {showTagline && !compact && !customName && <span className="logo__tagline">{APP_TAGLINE}</span>}
      </div>
      <span className="visually-hidden">{name}</span>
    </div>
  )
}

export default Logo
