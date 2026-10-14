import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Badge from '../../../components/ui/Badge.jsx'
import DeleteForever from '../components/DeleteForever.jsx'
import ProfilePhotoEditor from '../../../components/ProfilePhotoEditor.jsx'
import Avatar from '../../../components/ui/Avatar.jsx'
import Button from '../../../components/ui/Button.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { employeeExtrasApi, employeesApi, organizationsApi, shiftsApi, skillsApi } from '../../../services/adminService.js'
import { emailSentence } from '../../../utils/emailNote.js'
import { formatDate, formatDateTime, formatMoney, humanize } from '../../../utils/format.js'
import { formatTimeRange } from '../../../utils/contractFormat.js'
import ChangeShiftModal from '../components/ChangeShiftModal.jsx'
import EmployeeFormModal from '../components/EmployeeFormModal.jsx'
import EmployeeSkillModal from '../components/EmployeeSkillModal.jsx'
import Notice from '../components/Notice.jsx'
import { EmptyState, ErrorState } from '../components/StateBox.jsx'
import { ActiveBadge, AvailabilityBadge } from '../components/StatusBadge.jsx'
import './EmployeeDetailsPage.css'

function InfoItem({ label, children }) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd>{children || <span className="cell-muted">—</span>}</dd>
    </div>
  )
}

function EmployeeDetailsPage() {
  const { employeeId } = useParams()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [skillTarget, setSkillTarget] = useState(null) // null | 'new' | skill
  const [skillToRemove, setSkillToRemove] = useState(null)
  const [changingShift, setChangingShift] = useState(false)
  const [notice, setNotice] = useState('')
  const [photoVersion, setPhotoVersion] = useState()

  const { data: employee, error, loading, reload } = useFetch(
    (signal) => employeesApi.get(employeeId, signal),
    `employee-${employeeId}`,
  )
  const { data: organizations } = useFetch((signal) => organizationsApi.lookup(signal), 'organizations')
  const { data: skillCatalog } = useFetch((signal) => skillsApi.lookup(signal), 'skill-lookup')
  const { data: shifts } = useFetch((signal) => shiftsApi.list(signal), 'shifts')

  async function handleRemoveSkill() {
    await employeeExtrasApi.removeSkill(employee.employeeId, skillToRemove.skillId)
    setNotice(`${skillToRemove.skillName} was removed.`)
    setSkillToRemove(null)
    reload()
  }

  async function handleToggleActive() {
    const makeActive = !employee.isActive
    const result = await employeesApi.setActive(employee.employeeId, makeActive)
    setNotice(`${employee.fullName} was ${makeActive ? 'activated' : 'deactivated'}.${emailSentence(result)}`)
    setToggling(false)
    reload()
  }

  const back = (
    <Link className="back-link" to="/admin/employees">
      <Icon name="arrowLeft" size={16} /> Back to Employee Pool
    </Link>
  )

  if (!employee && loading) {
    return (
      <div className="page">
        {back}
        <Spinner label="Loading employee..." />
      </div>
    )
  }

  if (!employee) {
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
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card employee-hero">
        <Avatar userId={employee.userId} name={employee.fullName} version={photoVersion} size="lg" />
        <div className="employee-hero__main">
          <h2 className="employee-hero__name">{employee.fullName}</h2>
          <p className="employee-hero__sub">
            EMP-{String(employee.employeeId).padStart(3, '0')} · {employee.email}
          </p>
          <div className="employee-hero__badges">
            <AvailabilityBadge status={employee.availabilityStatus} />
            <ActiveBadge isActive={employee.isActive} />
            {employee.rating != null && <Badge tone="gold">★ {Number(employee.rating).toFixed(1)}</Badge>}
          </div>
        </div>
        <div className="employee-hero__actions">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Icon name="edit" size={17} /> Edit
          </Button>
          <Button variant="secondary" onClick={() => setToggling(true)}>
            <Icon name={employee.isActive ? 'ban' : 'checkCircle'} size={17} /> {employee.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          {!employee.isActive && (
            <DeleteForever
              look="button"
              name={employee.fullName}
              title="Delete employee completely?"
              message={`${employee.fullName} and their sign-in account will be removed for good, with their skills, shift and salary set-up. This cannot be undone. An employee who has allocations, payroll, overtime or reviews cannot be deleted because those records must be kept.`}
              onDelete={() => employeesApi.remove(employee.employeeId)}
              onDone={(message) => navigate('/admin/employees', { replace: true, state: { message } })}
            />
          )}
        </div>
      </section>

      {employee.userId != null && (
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Profile picture</h3>
          </div>
          <div className="card__body">
            <ProfilePhotoEditor userId={employee.userId} name={employee.fullName} version={photoVersion} onChanged={setPhotoVersion} />
          </div>
        </section>
      )}

      <div className="details-grid">
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Profile</h3>
          </div>
          <dl className="card__body info-list">
            <InfoItem label="Organization">{employee.workingOrgName || employee.organizationName || 'Central pool (unassigned)'}</InfoItem>
            {employee.workingOrgName && employee.isWorkingElsewhere && <InfoItem label="Home organization">{employee.organizationName || 'Central pool'}</InfoItem>}
            <InfoItem label="Joining date">{employee.joiningDate ? formatDate(employee.joiningDate) : null}</InfoItem>
            <InfoItem label="Hourly rate">{employee.hourlyRate != null ? formatMoney(employee.hourlyRate) : null}</InfoItem>
            <InfoItem label="Phone">{employee.phone}</InfoItem>
            <InfoItem label="CNIC">{employee.cnic}</InfoItem>
            <InfoItem label="Age">{employee.age}</InfoItem>
            <InfoItem label="Country">{employee.country}</InfoItem>
            <InfoItem label="Account created">{employee.createdAt ? formatDateTime(employee.createdAt) : null}</InfoItem>
          </dl>
        </section>

        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Skills</h3>
            <Button variant="secondary" onClick={() => setSkillTarget('new')}>
              <Icon name="plus" size={16} /> Add skill
            </Button>
          </div>
          <div className="card__body">
            {employee.skillDetails.length === 0 ? (
              <p className="cell-muted">No skills yet. Add the skills this employee can handle so they can be matched to requests.</p>
            ) : (
              <ul className="skill-list">
                {employee.skillDetails.map((skill) => (
                  <li key={skill.skillId}>
                    <span>
                      <strong>{skill.skillName}</strong>
                      {skill.skillCategory && <span className="cell-muted"> · {skill.skillCategory}</span>}
                    </span>
                    <span className="skill-list__meta">
                      {skill.efficiencyLevel && <Badge tone="gold">{skill.efficiencyLevel}</Badge>}
                      {skill.yearsOfExperience != null && <span className="cell-muted">{skill.yearsOfExperience} yr</span>}
                      <button type="button" className="icon-btn" onClick={() => setSkillTarget(skill)} aria-label={`Edit ${skill.skillName}`} title="Edit">
                        <Icon name="edit" size={16} />
                      </button>
                      <button type="button" className="icon-btn icon-btn--danger" onClick={() => setSkillToRemove(skill)} aria-label={`Remove ${skill.skillName}`} title="Remove">
                        <Icon name="close" size={16} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Shift</h3>
          <Button variant="secondary" onClick={() => setChangingShift(true)}>
            <Icon name="clock" size={16} /> Change shift
          </Button>
        </div>
        <div className="card__body">
          {employee.currentShift ? (
            <p>
              <Link to={`/admin/shifts/${employee.currentShift.shiftId}`}>
                <strong>{employee.currentShift.shiftName}</strong>
              </Link>{' '}
              <span className="cell-muted">
                {formatTimeRange(employee.currentShift.startTime, employee.currentShift.endTime)} · since {formatDate(employee.currentShift.startDate)}
              </span>
            </p>
          ) : (
            <p className="cell-muted">No shift assigned.</p>
          )}
          {employee.shiftHistory.filter((item) => item.endDate).length > 0 && (
            <ul className="skill-list" style={{ marginTop: '0.9rem' }}>
              {employee.shiftHistory
                .filter((item) => item.endDate)
                .map((item) => (
                  <li key={item.assignmentId}>
                    <span>{item.shiftName}</span>
                    <span className="cell-muted">
                      {formatDate(item.startDate)} – {formatDate(item.endDate)}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Status history</h3>
        </div>
        {employee.statusHistory.length === 0 ? (
          <EmptyState icon="clock" title="No status changes yet" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Change</th>
                  <th>Reason</th>
                  <th>Changed by</th>
                </tr>
              </thead>
              <tbody>
                {employee.statusHistory.map((event) => (
                  <tr key={event.statusHistoryId}>
                    <td>{formatDateTime(event.changedAt)}</td>
                    <td>
                      {event.oldStatus ? `${humanize(event.oldStatus)} → ` : ''}
                      <strong>{humanize(event.newStatus)}</strong>
                    </td>
                    <td className="cell-muted">{event.reason || '—'}</td>
                    <td className="cell-muted">{event.changedBy || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Allocation history</h3>
        </div>
        {employee.allocationHistory.length === 0 ? (
          <EmptyState icon="activity" title="No allocations yet" text="Allocation events will appear here once this employee is assigned to an organization." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Reason</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {employee.allocationHistory.map((event) => (
                  <tr key={event.allocationHistoryId}>
                    <td>{formatDateTime(event.actionTime)}</td>
                    <td>{humanize(event.actionType)}</td>
                    <td>{event.fromOrganization || '—'}</td>
                    <td>{event.toOrganization || '—'}</td>
                    <td className="cell-muted">{event.actionReason || '—'}</td>
                    <td>{event.isAllocatedByAi ? <Badge tone="info">AI</Badge> : <Badge>Manual</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {skillTarget && (
        <EmployeeSkillModal
          employeeId={employee.employeeId}
          skill={skillTarget === 'new' ? null : skillTarget}
          catalog={skillCatalog ?? []}
          ownedIds={employee.skillDetails.map((skill) => skill.skillId)}
          onClose={() => setSkillTarget(null)}
          onSaved={(message) => {
            setSkillTarget(null)
            setNotice(message)
            reload()
          }}
        />
      )}

      {skillToRemove && (
        <ConfirmDialog
          title="Remove skill?"
          message={`${skillToRemove.skillName} will be removed from ${employee.fullName}.`}
          confirmLabel="Remove"
          danger
          onConfirm={handleRemoveSkill}
          onCancel={() => setSkillToRemove(null)}
        />
      )}

      {changingShift && (
        <ChangeShiftModal
          employee={employee}
          shifts={shifts ?? []}
          onClose={() => setChangingShift(false)}
          onSaved={(message) => {
            setChangingShift(false)
            setNotice(message)
            reload()
          }}
        />
      )}

      {editing && (
        <EmployeeFormModal
          employee={employee}
          organizations={organizations ?? []}
          onClose={() => setEditing(false)}
          onPictureChanged={setPhotoVersion}
          onSaved={(message) => {
            setEditing(false)
            setNotice(message)
            reload()
          }}
        />
      )}

      {toggling && (
        <ConfirmDialog
          title={employee.isActive ? 'Deactivate employee?' : 'Activate employee?'}
          message={
            employee.isActive
              ? `${employee.fullName} will no longer be able to sign in or be allocated. Their history is kept.`
              : `${employee.fullName} will be able to sign in again. Their availability stays Offline until you change it.`
          }
          confirmLabel={employee.isActive ? 'Deactivate' : 'Activate'}
          danger={employee.isActive}
          onConfirm={handleToggleActive}
          onCancel={() => setToggling(false)}
        />
      )}
    </div>
  )
}

export default EmployeeDetailsPage
