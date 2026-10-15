import Avatar from '../../../components/ui/Avatar.jsx'
import Button from '../../../components/ui/Button.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import { formatDateTime } from '../../../utils/format.js'
import { ActiveBadge } from '../shared/StatusBadge.jsx'

function Item({ label, children }) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd>{children || '—'}</dd>
    </div>
  )
}

/** Everything known about an admin, business owner or organization manager (read-only). `person` is a row of the Team list. */
function UserDetailsModal({ person, kind, onClose }) {
  const isManager = kind === 'Organization Manager'

  return (
    <Modal title={person.fullName} subtitle={kind} size="lg" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="view-header">
        <Avatar userId={person.userId} name={person.fullName} hasPicture={person.hasPicture} size="xl" />
        <div>
          <p className="view-header__email">{person.email}</p>
          <ActiveBadge isActive={person.isActive} />
        </div>
      </div>

      <dl className="info-list">
        <Item label="Role">{kind}</Item>
        <Item label="Email">{person.email}</Item>
        <Item label="Phone">{person.phone}</Item>
        <Item label="CNIC">{person.cnic}</Item>
        <Item label="Age">{person.age}</Item>
        <Item label="Country">{person.country}</Item>
        <Item label="Account created">{person.createdAt ? formatDateTime(person.createdAt) : ''}</Item>
        <Item label="Account">{person.isActive ? 'Active' : 'Deactivated'}</Item>
        {isManager && (
          <div className="info-item info-item--full">
            <dt>Organizations</dt>
            <dd>
              {person.organizations?.length > 0 ? (
                <span className="chip-list">
                  {person.organizations.map((assignment) => (
                    <span className="chip" key={assignment.managerId}>
                      {assignment.organizationName || `#${assignment.organizationId}`}
                    </span>
                  ))}
                </span>
              ) : (
                'None assigned'
              )}
            </dd>
          </div>
        )}
      </dl>
    </Modal>
  )
}

export default UserDetailsModal
