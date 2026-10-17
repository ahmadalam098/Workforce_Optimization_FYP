import { Link, useParams } from 'react-router-dom'
import Alert from '../../../components/ui/Alert.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { employeeTicketsApi } from '../../../services/employee/employeeService.js'
import { formatDateTime } from '../../../utils/format.js'
import { PriorityBadge } from '../../admin/queries/TicketBadges.jsx'
import { EmptyState, ErrorState } from '../../admin/shared/StateBox.jsx'
import { StageBadge } from './EmployeeQueriesPage.jsx'

/** Employee: one query or complaint I sent, with the answer once there is one. */
function EmployeeQueryDetailsPage() {
  const { ticketId } = useParams()
  const { data: ticket, error, loading, reload } = useFetch((signal) => employeeTicketsApi.get(ticketId, signal), `employee-ticket-${ticketId}`)

  const back = (
    <Link className="back-link" to="/employee/queries">
      <Icon name="arrowLeft" size={16} /> Back to My Queries
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

  return (
    <div className="page">
      {back}

      <section className="card hero-card">
        <div className="hero-card__main">
          <h2 className="hero-card__title">{ticket.subject}</h2>
          <p className="hero-card__sub">
            {ticket.ticketNumber} · {ticket.category}
            {ticket.organization && <> · {ticket.organization}</>} · sent {formatDateTime(ticket.createdAt)}
          </p>
          <div className="hero-card__badges">
            <StageBadge stage={ticket.stage} />
            <PriorityBadge priority={ticket.priority} />
          </div>
        </div>
      </section>

      {ticket.stage === 'With the admin' && <Alert type="info">Your manager passed this to the admin. You will be told when it is answered.</Alert>}

      <div className="details-grid">
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">What you wrote</h3>
          </div>
          <div className="card__body">
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{ticket.description}</p>
          </div>
        </section>

        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Answer</h3>
          </div>
          <div className="card__body">
            {ticket.answers.length === 0 ? (
              <EmptyState icon="clock" title="No answer yet" text="Your manager or the admin has not answered this yet." />
            ) : (
              <ul className="plain-list">
                {ticket.answers.map((answer) => (
                  <li key={`${answer.createdAt}-${answer.body.slice(0, 12)}`}>
                    <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{answer.body}</p>
                    <p className="cell-muted">
                      {answer.author || 'Your manager'} · {formatDateTime(answer.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default EmployeeQueryDetailsPage
