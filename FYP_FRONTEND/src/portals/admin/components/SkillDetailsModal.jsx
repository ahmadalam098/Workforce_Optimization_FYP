import { Link } from 'react-router-dom'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import Modal from '../../../components/ui/Modal.jsx'
import { ActiveBadge } from './StatusBadge.jsx'

function Item({ label, children }) {
  return (
    <div className="info-item">
      <dt>{label}</dt>
      <dd>{children || '—'}</dd>
    </div>
  )
}

/** Everything known about a skill of the catalog (read-only). `skill` is a row of the Skills list. */
function SkillDetailsModal({ skill, onClose }) {
  return (
    <Modal title={skill.name} subtitle="Skill" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <dl className="info-list">
        <Item label="Category">{skill.category ? <Badge tone="gold">{skill.category}</Badge> : ''}</Item>
        <Item label="Status">
          <ActiveBadge isActive={skill.isActive} />
        </Item>
        <Item label="Employees with this skill">
          {skill.employeeCount > 0 ? <Link to={`/admin/employees?skillId=${skill.skillId}`}>{skill.employeeCount}</Link> : 'None'}
        </Item>
        <div className="info-item info-item--full">
          <dt>Description</dt>
          <dd>{skill.description || '—'}</dd>
        </div>
      </dl>
    </Modal>
  )
}

export default SkillDetailsModal
