import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import { managerTicketsApi } from '../../../services/manager/managerService.js'
import { formatDateTime } from '../../../utils/format.js'
import { PriorityBadge, TicketStatusBadge } from '../../admin/queries/TicketBadges.jsx'
import Notice from '../../admin/shared/Notice.jsx'
import { ErrorState } from '../../admin/shared/StateBox.jsx'
import { ResolveEmployeeQueryModal, SendToAdminModal } from './ManagerTicketModals.jsx'
import { FromBadge, SentBadge } from './ManagerQueriesPage.jsx'

/** Organization Manager: one query or complaint with what was written, the answer, and the actions (answer it, or send it to the admin). */
function ManagerQueryDetailsPage() {
  const { ticketId } = useParams()
  const [notice, setNotice] = useFlashNotice()
  const [sending, setSending] = useState(false)
  const [resolving, setResolving] = useState(false)
  const { data: ticket, error, loading, reload } = useFetch((signal) => managerTicketsApi.get(ticketId, signal), `manager-ticket-${ticketId}`)

  const back = (
    <Link className="back-link" to="/manager/queries">
      <Icon name="arrowLeft" size={16} /> Back to Queries & Complaints
    </Link>
  )

  if (!ticket && loading) return <Spinner label="Loading..." />
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

  const resolution = ticket.messages.filter((message) => message.messageType === 'Resolution')
  const done = (message) => {
    setSending(false)
    setResolving(false)
    setNotice(message)
    reload()
  }

  return (
    <div className="page">
      {back}
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card hero-card">
        <div className="hero-card__main">
          <h2 className="hero-card__title">{ticket.subject}</h2>
          <p className="hero-card__sub">
            {ticket.ticketNumber} · {ticket.orgName} · received {formatDateTime(ticket.createdAt)}
            {ticket.raisedBy && <> · from {ticket.raisedBy}</>}
          </p>
          <div className="hero-card__badges">
            <FromBadge ticket={ticket} />
            <Badge tone={ticket.category === 'Complaint' ? 'danger' : 'info'}>{ticket.category}</Badge>
            <TicketStatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <SentBadge ticket={ticket} />
          </div>
        </div>
        <div className="hero-card__actions">
          {ticket.canResolve && (
            <Button onClick={() => setResolving(true)}>
              <Icon name="checkCircle" size={17} /> Answer
            </Button>
          )}
          {ticket.canForward && (
            <Button variant={ticket.canResolve ? 'secondary' : 'primary'} onClick={() => setSending(true)}>
              <Icon name="send" size={17} /> Send to admin
            </Button>
          )}
        </div>
      </section>

      {ticket.isSevere && ticket.status === 'Open' && !ticket.forwardedAt && (
        <Alert type="warning">This is a {ticket.priority.toLowerCase()} severity {ticket.source === 'Employee' ? 'query' : ticket.category.toLowerCase()}. Only the admin resolves severe ones: send it to the admin.</Alert>
      )}

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">What was written</h3>
        </div>
        <div className="card__body">
          <p style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
        </div>
      </section>

      {ticket.forwardedAt && (
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Sent to the admin</h3>
          </div>
          <div className="card__body">
            <p>
              Sent by {ticket.forwardedBy || 'you'} on {formatDateTime(ticket.forwardedAt)}.
            </p>
            {ticket.forwardNote && <p className="cell-muted">Your note: {ticket.forwardNote}</p>}
          </div>
        </section>
      )}

      {resolution.length > 0 && (
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">How it was resolved</h3>
          </div>
          <div className="card__body form-stack">
            {resolution.map((message) => (
              <div key={message.messageId}>
                <p style={{ whiteSpace: 'pre-wrap' }}>{message.body}</p>
                <p className="cell-muted">
                  {message.author || 'The admin'} · {formatDateTime(message.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {sending && <SendToAdminModal ticket={ticket} onClose={() => setSending(false)} onDone={done} />}
      {resolving && <ResolveEmployeeQueryModal ticket={ticket} onClose={() => setResolving(false)} onDone={done} />}
    </div>
  )
}

export default ManagerQueryDetailsPage
