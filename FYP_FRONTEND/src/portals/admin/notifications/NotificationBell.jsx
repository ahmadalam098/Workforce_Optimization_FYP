import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../../components/ui/Icon.jsx'
import { useAuth } from '../../../context/useAuth.js'
import { useNotificationFeed } from '../../../hooks/useNotificationFeed.js'
import { formatDateTime, formatTimeAgo } from '../../../utils/format.js'
import { actionTone, entityLink } from '../shared/auditLinks.js'
import './NotificationBell.css'

const TONE_ICONS = { success: 'checkCircle', danger: 'alert', info: 'info' }

// Alerts (unread chat messages, contracts ending, "your shift starts") are not audit entries, so the server cannot mark them as read.
// "Mark all as read" remembers them in this browser instead: an alert counts again only when it changes (its key changes).
const MAX_REMEMBERED = 100
const alertKey = (alert) => alert.key ?? alert.title

function readDismissed(storageKey) {
  try {
    const list = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function saveDismissed(storageKey, list) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(list))
  } catch {
    // Private window or blocked storage: the alerts simply count again after a reload.
  }
}

function NotificationRow({ item, onOpen, linkFor }) {
  const tone = actionTone(item.action)
  const link = linkFor(item.entityType, item.entityId, item.action)
  const body = (
    <>
      <span className={`notif-item__icon notif-item__icon--${tone}`} aria-hidden="true">
        <Icon name={TONE_ICONS[tone]} size={16} />
      </span>
      <span className="notif-item__text">
        <span className="notif-item__title">{item.title}</span>
        {item.message && <span className="notif-item__message">{item.message}</span>}
        <span className="notif-item__meta" title={formatDateTime(item.createdAt)}>
          {item.actorName || 'System'} · {formatTimeAgo(item.createdAt)}
        </span>
      </span>
      {item.isUnread && <span className="notif-item__dot" aria-label="Unread" />}
    </>
  )

  return link ? (
    <Link className={`notif-item ${item.isUnread ? 'is-unread' : ''}`} to={link} onClick={onOpen}>
      {body}
    </Link>
  ) : (
    <div className={`notif-item ${item.isUnread ? 'is-unread' : ''}`}>{body}</div>
  )
}

/**
 * The bell in the header: a count of what is new, and the latest activity (employees, organizations, managers ...).
 * The Admin portal uses the defaults; the other portals pass their own api, link helper and (no) footer. `extraAlerts(feed)` may return
 * alerts that the portal works out itself from the feed ([{ title, message, link }]), for example with the browser's local time.
 */
function NotificationBell({ api, linkFor = entityLink, footerTo = '/admin/audit-logs', extraAlerts }) {
  const { feed, error, markAllRead } = useNotificationFeed(api)
  const { user } = useAuth()
  const storageKey = `wfn-read-alerts-${user?.userId ?? 'anyone'}`
  const [dismissed, setDismissed] = useState(() => readDismissed(storageKey))
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const extra = feed && extraAlerts ? extraAlerts(feed) : []
  const items = feed?.items ?? []
  const alerts = [...(feed?.alerts ?? []), ...extra]
  // The server counts its own alerts in unreadCount; take them out and count only the alerts that have not been marked as read.
  const unreadItems = Math.max(0, (feed?.unreadCount ?? 0) - (feed?.alerts?.length ?? 0))
  const isLive = (alert) => !dismissed.includes(alertKey(alert))
  const unread = unreadItems + alerts.filter(isLive).length

  async function handleMarkAllRead() {
    await markAllRead()
    const next = [...new Set([...dismissed, ...alerts.map(alertKey)])].slice(-MAX_REMEMBERED)
    setDismissed(next)
    saveDismissed(storageKey, next)
  }

  // Switched off in Settings > Notifications.
  if (feed && feed.enabled === false) return null

  return (
    <div className="notif" ref={rootRef}>
      <button
        type="button"
        className="admin-topbar__icon-btn notif__button"
        onClick={() => setOpen((current) => !current)}
        aria-label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Icon name="bell" />
        {unread > 0 && <span className="notif__badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="notif__panel" role="dialog" aria-label="Notifications">
          <div className="notif__header">
            <h3 className="notif__title">Notifications</h3>
            <button type="button" className="notif__link-btn" onClick={handleMarkAllRead} disabled={unread === 0}>
              Mark all as read
            </button>
          </div>

          <div className="notif__list">
            {alerts.map((alert) => {
              const link = alert.link || linkFor(alert.entityType, alert.entityId)
              const content = (
                <>
                  <span className="notif-item__icon notif-item__icon--danger" aria-hidden="true">
                    <Icon name="alert" size={16} />
                  </span>
                  <span className="notif-item__text">
                    <span className="notif-item__title">{alert.title}</span>
                    <span className="notif-item__message">{alert.message}</span>
                  </span>
                </>
              )
              const state = isLive(alert) ? 'is-unread' : ''
              return link ? (
                <Link key={alertKey(alert)} className={`notif-item ${state}`} to={link} onClick={() => setOpen(false)}>
                  {content}
                </Link>
              ) : (
                <div key={alertKey(alert)} className={`notif-item ${state}`}>{content}</div>
              )
            })}
            {error && !feed ? (
              <p className="notif__empty">{error}</p>
            ) : !feed ? (
              <p className="notif__empty">Loading...</p>
            ) : items.length === 0 && alerts.length === 0 ? (
              <p className="notif__empty">Nothing yet. Activity such as new allocations, requests or invoices will show up here.</p>
            ) : (
              items.map((item) => <NotificationRow key={item.id} item={item} linkFor={linkFor} onOpen={() => setOpen(false)} />)
            )}
          </div>

          {footerTo && (
            <Link className="notif__footer" to={footerTo} onClick={() => setOpen(false)}>
              View all activity
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

export default NotificationBell
