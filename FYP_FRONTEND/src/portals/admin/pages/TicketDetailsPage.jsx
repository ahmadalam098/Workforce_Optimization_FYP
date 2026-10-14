import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { ticketsApi } from '../../../services/adminService.js'
import { formatDateTime } from '../../../utils/format.js'
import DecisionModal from '../components/DecisionModal.jsx'
import Notice from '../components/Notice.jsx'
import { ErrorState } from '../components/StateBox.jsx'
import { PriorityBadge, TicketStatusBadge } from '../components/TicketBadges.jsx'
import './TicketDetailsPage.css'

/** One query: what the organization asked, and (once resolved) how it was resolved. */
function TicketDetailsPage() {
  const { ticketId } = useParams()
  const location = useLocation()
  const [notice, setNotice] = useState(location.state?.message ?? '')
  const [resolving, setResolving] = useState(false)

  const { data: ticket, error, loading, reload } = useFetch((signal) => ticketsApi.get(ticketId, signal), `ticket-${ticketId}`)

  const back = (
    <Link className="back-link" to="/admin/tickets">
      <Icon name="arrowLeft" size={16} /> Back to Queries
    </Link>
  )

  if (!ticket && loading) {
    return (
      <div className="page">
        {back}
        <Spinner label="Loading query..." />
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="page">
        {back}
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      </div>
    )
  }

  const isResolved = ticket.status === 'Resolved'

  return (
    <div className="page">
      {back}
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card hero-card">
        <div className="hero-card__main">
          <h2 className="hero-card__title">{ticket.subject}</h2>
          <p className="hero-card__sub">
            {ticket.ticketNumber} · {ticket.category}
            {ticket.orgId && (
              <>
                {' '}
                · <Link to={`/admin/organizations/${ticket.orgId}`}>{ticket.orgName}</Link>
              </>
            )}
          </p>
          <div className="hero-card__badges">
            <TicketStatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
        </div>
        <div className="hero-card__actions">
          {!isResolved && (
            <Button onClick={() => setResolving(true)}>
              <Icon name="checkCircle" size={17} /> Resolve
            </Button>
          )}
        </div>
      </section>

      <div className="ticket-layout">
        <section className="card ticket-thread">
          <div className="card__header">
            <h3 className="card__title">Conversation</h3>
          </div>
          <div className="card__body">
            <ol className="thread">
              <li className="thread__item thread__item--sender">
                <div className="thread__meta">
                  <strong>{ticket.raisedBy || ticket.orgName || ticket.source}</strong>
                  <span>{formatDateTime(ticket.createdAt)}</span>
                </div>
                <p className="thread__body">{ticket.description}</p>
              </li>

              {ticket.messages.map((message) => (
                <li key={message.messageId} className={`thread__item thread__item--${message.messageType.toLowerCase()}`}>
                  <div className="thread__meta">
                    <strong>{message.messageType === 'Customer' ? 'Sender' : message.author || 'Admin'}</strong>
                    <span>
                      <span className="thread__tag">{message.messageType === 'Resolution' ? 'Resolved with this comment' : message.messageType === 'Customer' ? 'Sender' : 'Reply'}</span>{' '}
                      {formatDateTime(message.createdAt)}
                    </span>
                  </div>
                  <p className="thread__body">{message.body}</p>
                </li>
              ))}
            </ol>

            {!isResolved && <p className="cell-muted">Press Resolve to answer this query. Your comment is emailed to the organization and its managers.</p>}
          </div>
        </section>

        <aside className="card">
          <div className="card__header">
            <h3 className="card__title">Details</h3>
          </div>
          <div className="card__body">
            <dl className="info-list">
              <div className="info-item">
                <dt>Sent by</dt>
                <dd>{ticket.raisedBy || ticket.source}</dd>
              </div>
              <div className="info-item">
                <dt>Organization</dt>
                <dd>{ticket.orgName || '—'}</dd>
              </div>
              <div className="info-item">
                <dt>Opened</dt>
                <dd>{formatDateTime(ticket.createdAt)}</dd>
              </div>
              <div className="info-item">
                <dt>Resolved</dt>
                <dd>{ticket.resolvedAt ? formatDateTime(ticket.resolvedAt) : '—'}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      {resolving && (
        <DecisionModal
          title="Resolve this query?"
          description="Write how it was resolved. The organization and its managers receive this comment by email."
          label="Comment"
          required
          confirmLabel="Resolve and notify"
          onSubmit={async (text) => {
            const result = await ticketsApi.resolve(ticket.ticketId, text)
            setResolving(false)
            setNotice(result?.message || 'Query resolved.')
            reload()
          }}
          onClose={() => setResolving(false)}
        />
      )}
    </div>
  )
}

export default TicketDetailsPage
