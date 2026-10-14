import Avatar from '../../../components/ui/Avatar.jsx'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { shiftsApi } from '../../../services/adminService.js'
import { formatDate } from '../../../utils/format.js'
import { formatDuration, formatTimeRange } from '../../../utils/contractFormat.js'
import AssignEmployeesModal from '../components/AssignEmployeesModal.jsx'
import Notice from '../components/Notice.jsx'
import ShiftFormModal from '../components/ShiftFormModal.jsx'
import { EmptyState, ErrorState } from '../components/StateBox.jsx'
import { AvailabilityBadge } from '../components/StatusBadge.jsx'

function ShiftDetailsPage() {
  const { shiftId } = useParams()
  const [assigning, setAssigning] = useState(false)
  const [editing, setEditing] = useState(false)
  const [removeTarget, setRemoveTarget] = useState(null)
  const [notice, setNotice] = useState('')

  const { data: shift, error, loading, reload } = useFetch((signal) => shiftsApi.get(shiftId, signal), `shift-${shiftId}`)

  const back = (
    <Link className="back-link" to="/admin/shifts">
      <Icon name="arrowLeft" size={16} /> Back to Shifts
    </Link>
  )

  if (!shift && loading) {
    return (
      <div className="page">
        {back}
        <Spinner label="Loading shift..." />
      </div>
    )
  }

  if (!shift) {
    return (
      <div className="page">
        {back}
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      </div>
    )
  }

  async function handleRemove() {
    await shiftsApi.unassign(shift.shiftId, [removeTarget.employeeId])
    setNotice(`${removeTarget.fullName} was removed from ${shift.name}.`)
    setRemoveTarget(null)
    reload()
  }

  return (
    <div className="page">
      {back}
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card hero-card">
        <div className="hero-card__main">
          <h2 className="hero-card__title">{shift.name}</h2>
          <p className="hero-card__sub">
            {formatTimeRange(shift.startTime, shift.endTime)} · {formatDuration(shift.durationMinutes)}
          </p>
          <div className="hero-card__badges">
            <Badge tone="gold">{shift.assignedCount} employee{shift.assignedCount === 1 ? '' : 's'}</Badge>
            {shift.isOvernight && <Badge tone="info">Overnight</Badge>}
          </div>
        </div>
        <div className="hero-card__actions">
          <Button onClick={() => setAssigning(true)}>
            <Icon name="plus" size={17} /> Assign employees
          </Button>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Icon name="edit" size={17} /> Edit shift
          </Button>
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Employees on this shift</h3>
        </div>
        {shift.assignments.length === 0 ? (
          <EmptyState
            icon="users"
            title="Nobody is on this shift"
            text="Assign employees to put them on this shift."
            action={
              <Button onClick={() => setAssigning(true)}>
                <Icon name="plus" size={17} /> Assign employees
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Organization</th>
                  <th>Status</th>
                  <th>On shift since</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shift.assignments.map((person) => (
                  <tr key={person.assignmentId} className={person.isActive ? '' : 'is-inactive'}>
                    <td>
                      <div className="person">
                        <Avatar userId={person.userId} name={person.fullName} hasPicture={person.hasPicture} />
                        <span>
                          <Link className="person__name" to={`/admin/employees/${person.employeeId}`}>
                            {person.fullName}
                          </Link>
                          <span className="person__sub">{person.email}</span>
                        </span>
                      </div>
                    </td>
                    <td>{person.organizationName || <span className="cell-muted">Central pool</span>}</td>
                    <td>
                      <AvailabilityBadge status={person.availabilityStatus} />
                    </td>
                    <td className="cell-muted">{formatDate(person.startDate)}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="icon-btn icon-btn--danger" onClick={() => setRemoveTarget(person)} aria-label={`Remove ${person.fullName} from this shift`} title="Remove from shift">
                          <Icon name="close" size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {assigning && (
        <AssignEmployeesModal
          shift={shift}
          onClose={() => setAssigning(false)}
          onDone={(message) => {
            setAssigning(false)
            setNotice(message)
            reload()
          }}
        />
      )}

      {editing && (
        <ShiftFormModal
          shift={shift}
          onClose={() => setEditing(false)}
          onSaved={(message) => {
            setEditing(false)
            setNotice(message)
            reload()
          }}
        />
      )}

      {removeTarget && (
        <ConfirmDialog
          title="Remove from shift?"
          message={`${removeTarget.fullName} will no longer be on ${shift.name}. The assignment stays in their history.`}
          confirmLabel="Remove"
          danger
          onConfirm={handleRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  )
}

export default ShiftDetailsPage
