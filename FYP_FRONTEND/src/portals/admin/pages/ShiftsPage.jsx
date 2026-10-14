import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { shiftsApi } from '../../../services/adminService.js'
import { formatDuration, formatTimeRange } from '../../../utils/contractFormat.js'
import Notice from '../components/Notice.jsx'
import PageHeader from '../components/PageHeader.jsx'
import ShiftFormModal from '../components/ShiftFormModal.jsx'
import { EmptyState, ErrorState } from '../components/StateBox.jsx'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import ViewButton from '../components/ViewButton.jsx'

function ShiftsPage() {
  const navigate = useNavigate()
  const [formTarget, setFormTarget] = useState(null) // null | 'new' | shift
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [notice, setNotice] = useFlashNotice()

  const { data, error, loading, reload } = useFetch((signal) => shiftsApi.list(signal), 'shifts')

  function handleSaved(message) {
    setFormTarget(null)
    setNotice(message)
    reload()
  }

  async function handleDelete() {
    await shiftsApi.remove(deleteTarget.shiftId)
    setNotice(`${deleteTarget.name} was deleted.`)
    setDeleteTarget(null)
    reload()
  }

  return (
    <div className="page">
      <PageHeader
        title="Shifts"
        description="Working shifts and who is on each one."
        actions={
          <Button onClick={() => navigate('/admin/shifts/new')}>
            <Icon name="plus" size={18} /> Add shift
          </Button>
        }
      />

      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card">
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading shifts..." />
        ) : data.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No shifts yet"
            text="Create shifts such as Morning, Evening and Night, then assign employees to them."
            action={
              <Button onClick={() => navigate('/admin/shifts/new')}>
                <Icon name="plus" size={18} /> Add shift
              </Button>
            }
          />
        ) : (
          <div className="table-wrap" aria-busy={loading}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Shift</th>
                  <th>Time</th>
                  <th>Duration</th>
                  <th>Employees</th>
                  <th>View</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((shift) => (
                  <tr key={shift.shiftId}>
                    <td>
                      <span className="person__name">{shift.name}</span>
                    </td>
                    <td>
                      {formatTimeRange(shift.startTime, shift.endTime)} {shift.isOvernight && <Badge tone="info">Overnight</Badge>}
                    </td>
                    <td className="cell-muted">{formatDuration(shift.durationMinutes)}</td>
                    <td>
                      {shift.assignedCount > 0 ? shift.assignedCount : <span className="cell-muted">None</span>}
                    </td>
                    <td>
                      <ViewButton to={`/admin/shifts/${shift.shiftId}`} label={`View ${shift.name}`} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="icon-btn" onClick={() => setFormTarget(shift)} aria-label={`Edit ${shift.name}`} title="Edit">
                          <Icon name="edit" size={17} />
                        </button>
                        <button type="button" className="icon-btn icon-btn--danger" onClick={() => setDeleteTarget(shift)} aria-label={`Delete ${shift.name}`} title="Delete">
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

      {formTarget && (
        <ShiftFormModal shift={formTarget === 'new' ? null : formTarget} onClose={() => setFormTarget(null)} onSaved={handleSaved} />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete shift?"
          message={`${deleteTarget.name} will be removed. A shift that has ever had employees assigned cannot be deleted; rename it instead.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

export default ShiftsPage
