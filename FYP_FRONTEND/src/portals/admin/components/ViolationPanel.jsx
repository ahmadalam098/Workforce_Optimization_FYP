import Alert from '../../../components/ui/Alert.jsx'
import Checkbox from '../../../components/ui/Checkbox.jsx'
import './ViolationPanel.css'

/**
 * Shows the rules an allocation would break. Hard rules can never be overridden;
 * contract rules can, after the admin ticks the confirmation (the override is audited).
 */
function ViolationPanel({ violations, canOverride, confirmed, onConfirmChange }) {
  return (
    <div className="violation-panel">
      <Alert type="error">
        <p className="violation-panel__title">{canOverride ? 'This breaks contract rules' : 'This cannot be done'}</p>
        <ul className="violation-panel__list">
          {violations.map((violation) => (
            <li key={violation.code}>
              {violation.message}
              {!violation.overridable && <span className="violation-panel__tag">Cannot be overridden</span>}
            </li>
          ))}
        </ul>
      </Alert>

      {canOverride && (
        <Checkbox
          label="I understand and want to override these rules. This will be recorded in the audit log."
          checked={confirmed}
          onChange={onConfirmChange}
        />
      )}
    </div>
  )
}

export default ViolationPanel
